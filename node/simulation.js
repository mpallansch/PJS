var http = require('http');
var url = require('url');

var simulations = {};
var started = false;

http.createServer(function (request, response) {
	var responseBody = 'Request ';
	var contentType = 'text/plain';
	var queryData = url.parse(request.url, true);
	switch(queryData.pathname){
		case '/register':
			var id = addSim(queryData.query.name);
	
			contentType = 'json';
			responseBody = JSON.stringify({
				id: id,
				admin: (size(simulations) === 1)
			});
			break;
		case '/unregister':
			delete simulations[queryData.query.id];
			break;
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
		case '/event':
			var sim = simulations[queryData.query.destination];
			if(sim === undefined){
				responseBody = 'Unable to find destination simulation';
			} else {
				simulations[queryData.query.destination].events.push({timeStamp: queryData.query.timeStamp, execute: queryData.query.execute, anti: queryData.query.anti});
				responseBody = 'OK';
			}
			break;
		case '/started':
			responseBody = String(started);
			break;
		case '/start':
			started = true;
			responseBody = 'OK';
			break;
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

	response.setHeader('Access-Control-Allow-Origin', 'http://localhost');
	response.writeHead(200, {'Content-Type': 'text/plain'});
	response.end(responseBody);
}).listen(8124);

function addSim(name){
	var i = 0;
	while(true){
		if(simulations[String(i)] === undefined){
			simulations[String(i)] = new Simulation(name);
			return i;
		}
		i++;
	}
}

function Simulation(pName){
	this.name = pName;
	this.events = [];
	this.localTime = 0;
}

function size(obj){
	var size = 0, key;
	for(key in obj){
		if(obj.hasOwnProperty(key)) size++;
	}
	return size;
}

console.log('Server running at http://127.0.0.1:8124/');