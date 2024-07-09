var ws = require('ws');

var wss = new ws.WebSocketServer({ port: 8080 });

var auction = {
	state: 'stopped',
	player: {
		name: 'Emmitt Smith',
		positions: ['RB'],
		faStatus: 'UFA'
	},
	bids: []
};

var states = {
	stopped: {
		enter: function() {
			auction.state = 'stopped';
			announceAuctionDetails();
		},
		exit: function() {},
		handleEvent: function(auctionEvent) {
			switch (auctionEvent) {
				case 'start':
					return states.started;

				case 'reset':
					console.log('resetting');
					auction.bids = [];
					announceAuctionDetails();
					return;

				default:
					return;
			}
		}
	},
	started: {
		data: {
			goingOnceTimeout: null
		},
		enter: function() {
			auction.state = 'started';
			announceAuctionDetails();

			this.data.goingOnceTimeout = setTimeout(function() {
				stateMachine.fireEvent('going-once');
			}, 5000);
		},
		exit: function() {
			clearTimeout(this.data.goingOnceTimeout);
		},
		handleEvent: function(auctionEvent) {
			switch (auctionEvent) {
				case 'new-high-bid':
					return states.started;

				case 'going-once':
					return states.goingOnce;

				default:
					return;
			}
		}
	},
	goingOnce: {
		data: {
			goingTwiceTimeout: null
		},
		enter: function() {
			auction.state = 'going-once';
			announceAuctionDetails();

			this.data.goingTwiceTimeout = setTimeout(function() {
				stateMachine.fireEvent('going-twice');
			}, 5000);
		},
		exit: function() {
			clearTimeout(this.data.goingTwiceTimeout);
		},
		handleEvent: function(auctionEvent) {
			switch (auctionEvent) {
				case 'new-high-bid':
					return states.started;

				case 'going-twice':
					return states.goingTwice;

				default:
					return;
			}
		}
	},
	goingTwice: {
		data: {
			stoppedTimeout: null
		},
		enter: function() {
			auction.state = 'going-twice';
			announceAuctionDetails();

			this.data.stoppedTimeout = setTimeout(function() {
				stateMachine.fireEvent('stop');
			}, 5000);
		},
		exit: function() {
			clearTimeout(this.data.stoppedTimeout);
		},
		handleEvent: function(auctionEvent) {
			switch (auctionEvent) {
				case 'new-high-bid':
					return states.started;

				case 'stop':
					return states.stopped;

				default:
					return;
			}
		}
	}
};

var stateMachine = {
	currentState: states.stopped,
	fireEvent: function(auctionEvent) {
		var nextState = this.currentState.handleEvent(auctionEvent);

		if (nextState) {
			this.currentState.exit();

			this.currentState = nextState;
			this.currentState.enter();
		}
	}
};

stateMachine.currentState.enter();

wss.on('connection', initializeNewConnection);

setInterval(function() {
	console.log(`${wss.clients.size} active connections`);
}, 10000);

setInterval(function() {
	wss.clients.forEach(function(ws) {
		if (!ws.isAlive) {
			console.log('cya');
			return ws.terminate();
		}

		ws.isAlive = false;
	});
}, 15000);

function initializeNewConnection(ws) {
	ws.isAlive = true;

	ws.on('message', handleMessage.bind(null, ws))

	console.log('new connection!');

	announceAuctionDetails();
}

function handleMessage(ws, rawMessage) {
	var { type, value } = JSON.parse(rawMessage.toString());

	if (type == 'ping') {
		ws.isAlive = true;
	}
	else if (type == 'bid') {
		var owner = value.owner;
		var price = parseInt(value.price);
		var highBid = auction.bids[0];

		if (!highBid || price > highBid.price) {
			highBid = {
				owner: owner,
				price: price
			};

			auction.bids.unshift(highBid);

			stateMachine.fireEvent('new-high-bid');
		}

		console.log(`bid from ${owner} for $${price}`);
	}
	else if (type == 'admin') {
		var action = value.action;

		if (action == 'start') {
			stateMachine.fireEvent('start');
		} else if (action == 'reset') {
			stateMachine.fireEvent('reset');
		}
	}
}

function announceAuctionDetails() {
	wss.clients.forEach(function(ws) {
		ws.send(JSON.stringify({
			type: 'auctionDetails',
			value: auction
		}));
	});
}
