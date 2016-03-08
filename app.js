var express = require('express');
var app = express();
var server = require('http').createServer(app)
var io = require('socket.io').listen(server);
io.set('log level', 1);
var exec = require('child_process').exec;

var allowedUsers = ['jr','scott','james','jon','newjames','steve'];

// Options
var xmms2cmd = 'sudo su pi -c \'/usr/bin/xmms2';
var serverPort = 80;
var buzzerCmd = '/usr/bin/aplay buzzer.wav'

// To test when not on a pi, uncomment this:
//var xmms2cmd = 'echo \'';
//var serverPort = 8081;

// Not options
var sockets = {};
var currentSong = '';
var johPlayer = '';

server.listen(serverPort);

app.configure(function(){
	app.use("/", express.static(__dirname + "/public"));
});

app.get('/', function (req, res) {
	res.sendfile(__dirname + '/index.html');
});

function runXmmsCommand(command, callback)
{
	if (typeof callback !== 'function') {
		var callback = function(error, stdout, stderr) {
			//console.log('stdout: ' + stdout);
			//console.log('stderr: ' + stderr);
			if (error !== null) {
				console.log('exec error: ' + error);
			}
		};
	}

	//console.log('exec: ' + xmms2cmd + ' ' + command + '\'');
	exec(xmms2cmd + ' ' + command + '\'', callback);
}

function buzz()
{
	exec(buzzerCmd);
}

function trackChangedEvent(newSong) {
	console.log('track changed: ' + newSong);

	for (var key in sockets) {
		if (sockets[key]) {
			console.log('reset vote for ' + sockets[key].user);
			sockets[key].currentTrackVoted = false;
		}
	}
}

function getCurrentTrackVotedCount() {
	var count = 0;
	for (var key in sockets) {
		if (sockets[key]) {
			if (sockets[key].currentTrackVoted) count++;
		}
	}
	return count;
}

function getCurrentTrackVotedUsers() {
	var users = new Array();
	for (var key in sockets) {
		if (sockets[key]) {
			if (sockets[key].currentTrackVoted) {
				users.push(sockets[key].user);
			}
		}
	}
	return users;
}

function getUserCount() {
	var count = 0;
	for (var key in sockets) {
		if (sockets[key]) {
			count++;
		}
	}
	return count;
}

function userIsConnected(user) {
	for (var key in sockets) {
		if (sockets[key] != null) {
			if (sockets[key].user == user) {
				return true;
			}
		}
	}
	return false;
}

function userIsAllowed(user) {
	for (var i = 0; i < allowedUsers.length; i++) {
		if (user == allowedUsers[i]) return true;
	}
	return false;
}

function getCurrentPlaying() {
	runXmmsCommand('current', function(error, stdout, stderr) {
			if (error !== null) {
				console.log('exec error: ' + error);
			} else {
				var matches = stdout.match(/Playing: (.*) - (.*): (\d{0,3}:\d{2}) of (\d{0,3}:\d{2})/);

				if (matches == null)
				{
					matches = ['','-= Stopped =-','','-','-'];
				}

				var np = {
					artist: matches[1],
					track: matches[2],
					curtime: matches[3],
					tracktime: matches[4],
					users: getUserCount(),
					votes: getCurrentTrackVotedCount(),
					voteusers: getCurrentTrackVotedUsers(),
					jarOfHeartsPlayer: johPlayer
				};
				io.sockets.emit('nowplaying', np);

				var oldSong = currentSong;
				currentSong = matches[1] + '/' + matches[2];
				if (oldSong != currentSong) {
					trackChangedEvent(currentSong);
				}
			}
			setTimeout(getCurrentPlaying, 1000);
	});
}

function next() {
	runXmmsCommand('next');
}

function voteNext(socket) {
	if (socket.currentTrackVoted != true)
	{
		socket.currentTrackVoted = true;
		var userCount = getUserCount();
		var voteCount = getCurrentTrackVotedCount();

		console.log('user ' + socket.user + ' voted next');
		console.log('user count = ' + userCount + ', vote count = ' + voteCount);

		if (voteCount >= (userCount / 2)) {
			console.log('nexting track, majority of votes');
			next();
		} else {
			console.log('not nexting yet');
		}

		buzz();
	}
	else
	{
		console.log('user ' + socket.user + ' voted next (again, so ignored)');
	}
}

function emergencyJarOfHearts(socket) {
	console.log('user ' + socket.user + ' requested Jar of Hearts in emergency situation');

	johPlayer = socket.user;

	var callback = function(error, stdout, stderr) {
		console.log('stdout: ' + stdout);
		console.log('stderr: ' + stderr);
		if (error !== null) {
			console.log('exec error: ' + error);
		}
	};
	
	exec('sudo su pi -c \'./emergency-jar-of-hearts.sh\'', callback);
}

io.set('authorization', function (handshakeData, callback) {
	if (typeof(handshakeData.query.user) == 'undefined' || handshakeData.query.user == '')
	{
		callback('User param (user) not passed', false);
	}
	else
	{
		callback(null, true);
	}
});

io.sockets.on('connection', function (socket) {
	var user = socket.handshake.query.user;

	if (userIsConnected(user))
	{
		console.log('dupe connection DENIED from ' + user + ' [' + socket.handshake.address.address + ']');
		socket.emit('dupe');
		socket.disconnect();
		return;
	}

	if (!userIsAllowed(user))
	{
		console.log('banned user DENIED from ' + user + ' [' + socket.handshake.address.address + ']');
		socket.emit('banned');
		socket.disconnect();
		return;
	}

	console.log('hello to ' + user + ' [' + socket.handshake.address.address + ']');
	sockets[socket.id] = socket;
	sockets[socket.id].currentTrackVoted = false;
	sockets[socket.id].user = user;

	socket.on('disconnect', function(data) {
		console.log('bye to ' + socket.user);
		sockets[socket.id] = null;
	});

	socket.on('votenext', function(data) {
		voteNext(socket);
	});
	
	socket.on('emergencyJarOfHearts', function(data) {
		emergencyJarOfHearts(socket);
	});
});

setTimeout(getCurrentPlaying, 1000);
