var http = require('http');
var url = require('url');

// Checks the number of arguments
if(process.argv.length < 4){
	console.log('Invalid number of arguments');
	console.log('Usage: node server.js [url to allow access] [port number]');
	return;
}

var simulations = {};
var started = false;

// Creates a server to listen on port specified
http.createServer(handleRequest).listen(parseInt(process.argv[3]));
console.log('Server running at port ' + process.argv[3]);

/**
 * Handles any request to specified port while running
 *
 * @this {function}
 * @param {object} request Object which contains information about the request
 * @param {object} response Object used to write a response to the client
 */
function handleRequest(request, response) {
	var responseBody = 'Request ';
	var contentType = 'text/plain';
	var queryData = url.parse(request.url, true);

	// Checks which request is being made
	switch(queryData.pathname){
		// For a register request, add the simulation to the simulations array
		// Then add the process id and admin status into the response
		case '/register':
			var id = addSim(queryData.query.name);
			contentType = 'json';
			responseBody = JSON.stringify({
				id: id,
				admin: (size(simulations) === 1)
			});
			break;
		// For an unregister request, delete the simulation object from the array
		// If the simulation array is empty after the delete, end the simulation
		case '/unregister':
			delete simulations[queryData.query.id];
			if(size(simulations) === 0){
				started = false;
			}
			break;
		// For a getevents request, return the events array for the simulation with the requested id
 		case '/getevents':
			var sim = simulations[queryData.query.id];
			if(sim === undefined){
				responseBody = 'Unable to find simulation with that id';
			} else {
				contentType = 'json';
				responseBody = JSON.stringify(simulations[queryData.query.id].events);	
				simulations[queryData.query.id].events = [];	
			}	
			break;
		// For an event request, add an object with the event information to the event queue of the destination simulation
		case '/event':
			var sim = undefined;
			for(var id in simulations){
				if(simulations.hasOwnProperty(id) && simulations[id].name === queryData.query.destination){
					sim = simulations[id];
					break;
				}
			}
			if(sim === undefined){
				responseBody = 'Unable to find destination simulation';
			} else {
				sim.events.push({timeStamp: queryData.query.timeStamp, execute: queryData.query.execute, anti: queryData.query.anti});
				responseBody = 'OK';
			}
			break;
		// For a started request, return a string representation of whether the simulation has been started yet
		case '/started':
			responseBody = String(started);
			break;
		// For a start request, set the started variable to true, to communicate to the other LP's on a started request
		case '/start':
			started = true;
			responseBody = 'OK';
			break;
		// For a GVT request, update the local time of the simulation which made the request based on the data passed
		// Then check the minimum of the LP's last reported minimum time stamp, and all events which are waiting to be sent to an LP
		// Return the minimum
		case '/GVT':
			var sim = simulations[queryData.query.id];
			if(sim === undefined){
				responseBody = 'Unable to find simulation with that id';
			} else {
				simulations[queryData.query.id].localTime = parseInt(queryData.query.GVT);
				var minTimeStamp = Number.MAX_VALUE;
				for(simId in simulations){
					var sim = simulations[simId];
					if(sim.localTime < minTimeStamp){
						minTimeStamp = sim.localTime;
					}
					sim.events.forEach(function(element,index){
						if(element.timeStamp < minTimeStamp){
							minTimeStamp = element.timeStamp;
						}
					});
				}
				responseBody = String(minTimeStamp);
			}
			break;
	}

	// Allows for cross domain requests to be made 
	response.setHeader('Access-Control-Allow-Origin', process.argv[2]);

	// Writes the content type into the response
	response.writeHead(200, {'Content-Type': contentType});

	// Writes in the response body, and sends the response to the client
	response.end(responseBody);
}

/**
 * Function which adds a new LP to the distributed simulation
 *
 * @this {function}
 * @param {string} name Name of the simulation, used for sending message
 * @return {integer} The id of the simulation which has just been added
 */
function addSim(name){
	// Finds the next integer id that is not already in use by an LP in the simulation
	var i = 0;
	while(true){
		if(simulations[String(i)] === undefined){
			simulations[String(i)] = new Simulation(name);
			return i;
		}
		i++;
	}
}

/**
 * Stores the name, events, and time of an LP in the distributed simulation
 *
 * @constructor
 * @this {Simulation}
 * @param {string} pName Name of the simulation, used for sending events
 */
function Simulation(pName){
	this.name = pName;
	this.events = [];
	this.localTime = 0;
}

/**
 * Returns the number of keys in a javascript object
 *
 * @this {function}
 * @param {object} obj The object to count the number of keys
 * @return {integer} The number of keys in obj
 */
function size(obj){
	var size = 0, key;
	for(key in obj){
		if(obj.hasOwnProperty(key)) size++;
	}
	return size;
}