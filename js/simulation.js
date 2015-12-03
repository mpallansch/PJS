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

	this.sendMessage = function(destination, event, anti){
		var data = {destination: destination, timeStamp: event.timeStamp, execute: event.execute.toString(), anti: anti};
		$.ajax({
			type: 'GET',
			url: serverRoot + 'event',
			data: data,
			success: function(data){
				if(data !== 'OK'){
					console.log('Failed to send event: ');
					console.log(event);
				}
			},
			error: function(data, text){
				stopProcess();
				console.log(text);
				console.log('Failed to send event: ');
				console.log(event);
			}
		});
	}

	this.addEvent = function(event){
		if(inputQueue[inputQueue.length - 1].timeStamp > event.timestamp){
			rollback(event.timestamp);
			inputQueue.splice(inputIndex, 0, event);		
		} else {
			inputQueue.push(event);
		}
	}

	this.getPID = function(){
		return pid;
	}

	function initialize(){
		bindPageUnload();
		if(admin){
			showModal('Start Simulation', sendStartCommand);
		} else {
			waitForStart();
			showModal('Waiting for admin to start simulation');
		}
	}

	function bindPageUnload(){
		$(window).bind('beforeunload',function(){
			if(pid !== null){
				setTimeout(function(){
					showModal('Join Simulation', register);
				},50);
				stopProcess();
				$.ajax({
					type: 'GET',
					url: serverRoot + 'unregister',
					data: {id: pid}
				});
				pid = null;
				return 'You have now exited the simulation.';
			} 
		});
	}

	function startProcess(){
		state.time = 0;
		loop = setInterval(function(){
			if(inputIndex < inputQueue.length){
				inputQueue[inputIndex].previousState = state;
				state.time = parseInt(inputQueue[inputIndex].timeStamp);
				state = inputQueue[inputIndex].execute(inputQueue[inputIndex], state);
				inputQueue[inputIndex].processed = true;
				inputIndex++;
			}

			computeGVT();

			for(var i = 0; i < inputIndex; i++){
				if(inputQueue[i].timeStamp < GVT){
					inputQueue.splice(i,1);
					inputIndex--;
					i--;
				}
			}

			draw(state);

			getEvents();
		}, interval);
	}

	function stopProcess(){
		clearInterval(loop);
	}

	function getEvents(){
		$.ajax({
			type: 'GET',
			url: serverRoot + 'getevents',
			data: {id: pid},
			success: function(data){
				data = JSON.parse(data);
				data.forEach(function(element, index){
					eval('element.execute = ' + element.execute + ';');
					var event = new Event(element.timeStamp, element.execute, pid);
					if(element.antiMessage){
						var found = false;
						for(var i = inputIndex; i < inputQueue.length; i++){
							if(inputQueue[i].timeStamp === event.timeStamp && inputQueue[i].execute.toString() === event.execute.toString()){
								inputQueue.splice(i,1);
								found = true;
								break;
							}
						}
						
						if(!found){
							for(var i = 0; i < inputIndex; i++){
								if(inputQueue[i].timeStamp === event.timeStamp && inputQueue[i].execute.toString() === event.execute.toString()){
									rollback(event.timeStamp);
									inputQueue.splice(inputIndex, 1);
									found = true;
									break;
								}
							}	
								
							if(!found){
								cancelledQueue.push(event);
							}
						}
					} else {
						cancelledQueue.forEach(function(element, index){
							if(element.timeStamp === event.timeStamp && element.execute.toString() === event.execute.toString()){
								cancelledQueue.splice(index,1);
								return;
							}
						});

						if(inputQueue[inputQueue.length - 1].timeStamp > event.timestamp){
							rollback(event.timestamp);
							inputQueue.splice(inputIndex, 0, event);		
						} else {
							inputQueue.push(event);
						}
					}
				});
			},
			error: function(data, text){
				stopProcess();
				console.log(text);
			},
			timeout: interval
		});
	}

	function rollback(time){
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

	function computeGVT(){
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

		$.ajax({
			type: 'GET',
			url: serverRoot + 'GVT',
			data: {id: pid, GVT: minTimeStamp},
			success: function(data){
				GVT = parseInt(data);
			}, 
			error: function(data, text){
				stopProcess();
				console.log(text);
				console.log('Unable to send GVT request');
			}
		});
	}

	function waitForStart(){
		loop = setInterval(function(){
			$.ajax({
				type: 'GET',
				url: serverRoot + 'started',
				success: function(data){
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

	function sendStartCommand(){
		$.ajax({
			type: 'GET',
			url: serverRoot + 'start',
			success: function(data){
				if(data !== 'OK'){
					console.log('Unable to start simulation');
				}
			},
			error: function(data, text){
				stopProcess();
				console.log(text);
				console.log('Unable to start simulation');
			}
		});
		startProcess();
	}

	function showModal(text, callback){
		var el = document.createElement('div');
		el.setAttribute('id','modal');
		el.setAttribute('style','position: fixed; width: 100%; height: 100%; top: 0; left: 0; text-align: center; background-color: gray; z-index: 100;');
		el.innerHTML = '<div style="position: relative; top: 45%;' + (callback === undefined ? '' : ' color: blue; cursor: pointer; text-decoration: underline;') + '">' + text + '</div>';
		if(callback){
			el.onclick = function(){
				removeModal();
				callback();
			};
		}
		document.body.appendChild(el);
	}

	function removeModal(){
		var el = document.getElementById('modal');
		document.body.removeChild(el);
	}

	function register(){
		$.ajax({
			type: 'GET',
			url: serverRoot + 'register',
			data: {name: name},
			success: function(data){
				data = JSON.parse(data);
				pid = data.id;
				admin = data.admin;
				initialize();
			},
			error: function(data, text){
				stopProcess();
				alert(text);
			}
		});
	}

	register();
}

function Event(pTimeStamp, pExecuteFunction, pDestination){
	this.timeStamp = pTimeStamp;
	this.execute = pExecuteFunction;

	this.processed = false;
	this.previousState = undefined;
	this.outputQueue = [];

	this.destination = pDestination;
	
	this.scheduleEvent = function(sim, event){
		if(this.destination === undefined || this.destination === sim.getPID()){
			sim.addEvent(event);
		} else {
			sim.sendMessage(this.destination, event, false);
		}
		this.outputQueue.push({destination: this.destination, event: event});
	}
}

function logQueue(queue){
	if(queue === undefined){
		console.log('undefined queue logged');
		return;
	}
	console.log('logging queue of length: ' + queue.length);
	queue.forEach(function(element, index){
		console.log('Event ' + index + '| timeStamp: ' + element.timeStamp + ' proccessed: ' + element.processed);
	});
}