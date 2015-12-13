/**
 * Public constructor which creates an instance of a simulation
 *
 * @constructor
 * @this {Simulation}
 * @param {string} pSimName The name of the simulation that other simulations will send events to
 * @param {string} pServerRoot The base url for the server that is running the supporting node script
 * @param {object} pState The starting state of the simulation with initial values for all properties
 * @param {array} pInputQueue The starting array of events which will be processed
 * @param {function} pDrawFunction The function that will be called to render the current state to the user
 */
function Simulation(pSimName, pServerRoot, pState, pInputQueue, pDrawFunction){
	var sim = this;
	var pid = null;
	var name = pSimName;
	var admin = false;
	var serverRoot = pServerRoot;
	var state = pState;
	var inputQueue = pInputQueue;
	var cancelledQueue = [];
	var draw = pDrawFunction;
	var loop;
	var interval = 1000;
	var GVT = 0;
	var inputIndex = 0;
	var roster = {};

	/**
	 * Public function that sends an event to another simulation
	 *
	 * @this {function}
	 * @param {string} destination Name of the simulation to send the event to
	 * @param {Event} event Event to send to the simulation
	 * @param {boolean} anti Flag that indicates whether the message is an anti message
	 */
	this.sendMessage = function(destination, event, anti){
		// Sends an ajax request to the server with the event information
		$.ajax({
			type: 'GET',
			url: serverRoot + 'event',
			data: {destination: destination, timeStamp: event.timeStamp, execute: event.execute.toString(), anti: anti},
			success: function(data){
				// If the response is not OK, log that the sending of the event was unsuccessful
				if(data !== 'OK'){
					console.log('Failed to send event: ');
					console.log(event);
				}
			},
			error: function(data, text){
				// If the server responded with an error, stop the process and log the error
				stopProcess();
				console.log(text);
				console.log('Failed to send event: ');
				console.log(event);
			}
		});
	}

	/**
	 * Public function that can be used to add an event to the simulation
	 *
	 * @this {function}
	 * @param {Event} event The event to be added to the input queue of the simulation
	 */
	this.addEvent = function(event){
		// If the current event timestamp is less than the time stamp of the last event
		// in the input queue, rollback to the current events timestamp, and add the event
		if(inputQueue[inputQueue.length - 1].timeStamp > event.timestamp){
			rollback(event.timestamp);
			inputQueue.splice(inputIndex, 0, event);		
		} else { //otherwise, append the current event to the end of the input queue
			inputQueue.push(event);
		}
	}

	/**
	 * Public function used to get the process id of the simulation
	 * 
	 * @this {function}
	 * @return {integer} pid Id of the current simulation
	 */
	this.getPID = function(){
		return pid;
	}

	/**
	 * Private function used by the library to initialize the simulation and wait for the start command
	 *
	 * @this {function}
	 */
	function initialize(){
		// Deregisters the simulation if the browser window is exited
		bindPageUnload();

		// If the user is the admin, display a button to start the simulation
		if(admin){
			showModal('Start Simulation', sendStartCommand);
		} else { // otherwise, display a message, and wait for the admin to start
			waitForStart();
			showModal('Waiting for admin to start simulation');
		}
	}

	/**
	 * Private function used by the library to unregister the simulation from the backend when the page is unloaded
	 * 
	 * @this {function}
	 */
	function bindPageUnload(){
		$(window).bind('beforeunload',function(){
			// If the simulation has already been exited, allow the page to close without interuption
			if(pid !== null){
				// If the user selects the 'stay on page' option, show a modal to rejoin the simulation
				setTimeout(function(){
					showModal('Join Simulation', register);
				},50);
				
				// Stops the current process and sends the unregister command
				stopProcess();
				$.ajax({
					type: 'GET',
					url: serverRoot + 'unregister',
					data: {id: pid}
				});
				pid = null;

				// Displays to the user that they have exited the simulation and will need to rejoin
				return 'You have now exited the simulation.';
			} 
		});
	}

	/**
	 * Private function to create an interval which executes the main body of the simulation
	 *
	 * @this {function}
	 */
	function startProcess(){
		// Resets time to 0 for users rejoining after attempting to exit
		state.time = 0;

		// Creates main loop for simulation
		loop = setInterval(function(){
			// Starts requests to get the GVT and Events from the server
			computeGVT();
			getEvents();

			// Draws the current state
			draw(state);

			// Process the next event in the inputQueue
			if(inputIndex < inputQueue.length){
				inputQueue[inputIndex].previousState = state;
				state.time = parseInt(inputQueue[inputIndex].timeStamp);
				state = inputQueue[inputIndex].execute(inputQueue[inputIndex], state);
				inputQueue[inputIndex].processed = true;
				inputIndex++;
			}

			// Garbage collect events that have timestamps < GVT
			for(var i = 0; i < inputIndex; i++){
				if(inputQueue[i].timeStamp < GVT){
					inputQueue.splice(i,1);
					inputIndex--;
					i--;
				}
			}			
		}, interval);
	}

	/**
	 * Private function to clear the interval which executes the main body of the simulation
	 *
	 * @this {function}
	 */
	function stopProcess(){
		clearInterval(loop);
	}

	/**
	 * Private function to update the input queue with the latest events sent to this simulation
	 *
	 * @this {function}
	 */
	function getEvents(){
		$.ajax({
			type: 'GET',
			url: serverRoot + 'getevents',
			data: {id: pid},
			success: function(data){
				// Iterate through each event that was recieved
				data.forEach(function(element, index){
					// Convert the string representation of the execute script into javascript executable
					eval('element.execute = ' + element.execute + ';');

					// Convert javascript object into Event object
					var event = new Event(element.timeStamp, element.execute, pid);

					if(element.antiMessage){
						// If the message is an anti message, check for it in the unprocessed section of the input queue
						var found = false;
						for(var i = inputIndex; i < inputQueue.length; i++){
							// If the event is recieved but not processed, simply remove it from the queue
							if(inputQueue[i].timeStamp === event.timeStamp && inputQueue[i].execute.toString() === event.execute.toString()){
								inputQueue.splice(i,1);
								found = true;
								break;
							}
						}
						
						// If the message is not in the input queue, check the already processed events
						if(!found){
							for(var i = 0; i < inputIndex; i++){
								// If the event is already processed, rollback to the event, and remove it from the queue
								if(inputQueue[i].timeStamp === event.timeStamp && inputQueue[i].execute.toString() === event.execute.toString()){
									rollback(event.timeStamp);
									inputQueue.splice(inputIndex, 1);
									found = true;
									break;
								}
							}	
								
							// If the event has not been recieved at all, add it to the cancelled queue
							if(!found){
								cancelledQueue.push(event);
							}
						}
					} else {
						// If the message is not an anti message, check the cancelled queue for it
						cancelledQueue.forEach(function(element, index){
							// If the message has been cancelled by previous anti message, remove it from the cancelled queue and do nothing with it
							if(element.timeStamp === event.timeStamp && element.execute.toString() === event.execute.toString()){
								cancelledQueue.splice(index,1);
								return;
							}
						});

						// If the event has a time stamp less than current simulation time, rollback
						if(inputQueue[inputQueue.length - 1].timeStamp > event.timestamp){
							rollback(event.timestamp);
							inputQueue.splice(inputIndex, 0, event);		
						} else {
							// Otherwise simply append the event to the end of the input queue
							inputQueue.push(event);
						}
					}
				});
			},
			error: function(data, text){
				// If there is a server error, stop the process and log the message
				stopProcess();
				console.log(text);
			},
			timeout: interval
		});
	}

	/**
	 * Private function to rollback the simulation to a certain time
	 *
	 * @this {function}
	 * @param {integer} time The time in which all elements with time stamp greater than or equal to that time will be rolled back
	 */
	function rollback(time){
		// Iterate backwards through the input queue, reverting to the previous states
		// and sending any associated anti messages
		var index = inputIndex-1;
		var event = inputQueue[index];
		while(event.timeStamp >= time){
			state = event.previousState;
			event.previousState = undefined;
			event.outputQueue.forEach(function(element,index){
				sendMessage(element);
			});
			outputQueue = [];
			event.processed = false;

			inputIndex--;
			index--;
			event = inputQueue[index];
		}
	}

	/**
	 * Private function which sends a request for the current Global Virtual time
	 * 
	 * @this {function}
	 */
	function computeGVT(){
		// Calculate the minimum time stamp of all events and anti messages in the input queue
		var minTimeStamp = Number.MAX_VALUE;
		inputQueue.forEach(function(element, index){
			if(element.timeStamp < minTimeStamp){
				minTimeStamp = element.timeStamp;
			}
			element.outputQueue.forEach(function(element, index){
				if(element.event.timeStamp < minTimeStamp){
					minTimeStamp = element.event.timeStamp;
				}
			});
		});

		// Send the local minimum to the server for future GVT calculations
		$.ajax({
			type: 'GET',
			url: serverRoot + 'GVT',
			data: {id: pid, GVT: minTimeStamp},
			success: function(data){
				// On success, store the reported GVT
				GVT = parseInt(data);
			}, 
			error: function(data, text){
				// If the server has an error, stop the process and log the error
				stopProcess();
				console.log(text);
				console.log('Unable to send GVT request');
			}
		});
	}

	/**
	 * Private function to start a process which periodically checks for if the simulation has started
	 *
	 * @this {function}
	 */
	function waitForStart(){
		// Creates a loop which periodically sends requests to check if the simulation has started
		loop = setInterval(function(){
			$.ajax({
				type: 'GET',
				url: serverRoot + 'started',
				success: function(data){
					// If the simulation has started, clear this loop
					// remove the modal saying 'waiting for start'
					// and start the main process
					if(data === 'true'){
						clearInterval(loop);
						removeModal();
						startProcess();
					} 
				},
				timeout: interval
			});
		}, interval);
	}

	/**
	 * Private function which sends a command to start the simulation
	 *
	 * @this {function}
	 */
	function sendStartCommand(){
		// Sends command to start the simulation
		$.ajax({
			type: 'GET',
			url: serverRoot + 'start',
			success: function(data){
				if(data !== 'OK'){
					console.log('Unable to start simulation');
				}
			},
			error: function(data, text){
				// If the server has an error, stop the process and log the error
				stopProcess();
				console.log(text);
				console.log('Unable to start simulation');
			}
		});
		startProcess();
	}

	/**
	 * Private function which shows a modal window
	 *
	 * @this {function}
	 * @param {string} text The text to display in the modal window
	 * @param {callback} callback Function to execute when the modal window is clicked
	 */
	function showModal(text, callback){
		// Creates div element in foreground of current page
		var el = document.createElement('div');
		el.setAttribute('id','modal');
		el.setAttribute('style','position: fixed; width: 100%; height: 100%; top: 0; left: 0; text-align: center; background-color: gray; z-index: 100;');
		el.innerHTML = '<div style="position: relative; top: 45%;' + (callback === undefined ? '' : ' color: blue; cursor: pointer; text-decoration: underline;') + '">' + text + '</div>';
		// If the callback function is defined, adds a click handler to remove the modal and call the function
		if(callback){
			el.onclick = function(){
				removeModal();
				callback();
			};
		}
		// Adds element into the page
		document.body.appendChild(el);
	}

	/**
	 * Private function to remove displayed modal window
	 *
	 * @this {function}
	 */
	function removeModal(){
		var el = document.getElementById('modal');
		document.body.removeChild(el);
	}

	/**
	 * Private function which registers the simulation with the backend process
	 *
	 * @this {function}
	 */
	function register(){
		// Sends a registration request
		$.ajax({
			type: 'GET',
			url: serverRoot + 'register',
			data: {name: name},
			success: function(data){
				// If successful, stores information such as the 
				// process id and admin status
				pid = data.id;
				admin = data.admin;
				initialize();
			},
			error: function(data, text){
				// If the server has an error, stop the process and log the error
				stopProcess();
				alert(text);
			}
		});
	}

	register();
}

/**
 * Public constructor which creates an instance of an event
 *
 * @constructor
 * @this {Event}
 * @param {integer} pTimeStamp The time the event should be processed
 * @param {function} pExecuteFunction The function to be executed when an event is processed
 * @param {string} pDestination The name of the simulation to which all messages generated by this event will be sent
 */
function Event(pTimeStamp, pExecuteFunction, pDestination){
	this.timeStamp = pTimeStamp;
	this.execute = pExecuteFunction;

	this.processed = false;
	this.previousState = undefined;
	this.outputQueue = [];

	this.destination = pDestination;

	/**
	 * Public function to schedule a follow-up event on the destination simulation
	 *
	 * @this {function}
	 * @param {Simulation} sim The simulation that is processing the event
	 * @param {Event} event The event to be sent to the other simulation
	 */	
	this.scheduleEvent = function(sim, event){
		// If there is no destination defined, add event to this simulation
		if(this.destination === undefined || this.destination === sim.getPID()){
			sim.addEvent(event);
		} else {
			// Otherwise, send message to the other LP and add a corresponding anti-message
			sim.sendMessage(this.destination, event, false);
			this.outputQueue.push({destination: this.destination, event: event});
		}
	}
}