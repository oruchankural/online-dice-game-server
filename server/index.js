const express = require('express');
const http = require('http');
const {Server} = require('socket.io');
const cors = require('cors');

const app = express();

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const rooms = {};
const SIDES = ['one', 'two', 'three', 'four', 'five', 'six'];
const generateDice = (count) => Array.from({length: count}, () => SIDES[Math.floor(Math.random() * SIDES.length)]);
const calcTotal = (dice) => dice.reduce((sum, face) => sum + SIDES.indexOf(face) + 1, 0);

io.on('connection', (socket) => {
    console.log(`Yeni Bağlantı: ${socket.id}`);
    socket.on('create_room', ({playerName, diceCount, rounds}) => {
        const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
        rooms[roomCode] = {
            code: roomCode,
            totalRounds: Number(rounds) || 3,
            currentRound: 1,
            activePlayerIndex: 0,
            isGameStarted: false,
            isGameOver: false,
            players: [
                {
                    id: socket.id,
                    name: playerName,
                    diceCount: Number(diceCount) || 4,
                    scores: [],
                    totalScore: 0,
                    isHost: true
                }
            ]
        };
        socket.join(roomCode);
        socket.emit('room_created', {roomCode, roomData: rooms[roomCode]});
    });
    socket.on('join_room', ({roomCode, playerName, diceCount}) => {
        const room = rooms[roomCode];
        if (!room) {
            socket.emit('error_message', 'Böyle bir oda bulunamadı!');
            return;
        }
        if (room.isGameStarted) {
            socket.emit('error_message', 'Oyun zaten başladı, katılamazsınız!');
            return;
        }
        const newPlayer = {
            id: socket.id,
            name: playerName,
            diceCount: Number(diceCount) || 4,
            scores: [],
            totalScore: 0,
            isHost: false
        };
        room.players.push(newPlayer);
        socket.join(roomCode);
        io.to(roomCode).emit('update_room', room);
    });
    socket.on('disconnect', () => {
        console.log(`Kullanıcı Ayrıldı: ${socket.id}`);
    });
    socket.on('start_game', ({roomCode}) => {
        const room = rooms[roomCode];
        if (room && socket.id === room.players[0].id) {
            room.isGameStarted = true;
            io.to(roomCode).emit('game_started', room);
        }
    });
    socket.on('roll_dice', ({roomCode}) => {
        const room = rooms[roomCode];
        if (!room || room.isGameOver) return;

        const currentPlayer = room.players[room.activePlayerIndex];

        if (socket.id !== currentPlayer.id) return;
        const newDice = generateDice(currentPlayer.diceCount);
        const total = calcTotal(newDice);
        const average = Number((total / newDice.length).toFixed(2));
        currentPlayer.scores.push(average);
        const sumScores = currentPlayer.scores.reduce((a, b) => a + b, 0);
        currentPlayer.totalScore = Number((sumScores / currentPlayer.scores.length).toFixed(2));
        let nextIndex = room.activePlayerIndex + 1;

        if (nextIndex < room.players.length) {
            room.activePlayerIndex = nextIndex;
        } else {
            if (room.currentRound < room.totalRounds) {
                room.currentRound += 1;
                room.activePlayerIndex = 0;
            } else {
                room.isGameOver = true;
            }
        }
        io.to(roomCode).emit('dice_rolled', {
            room,
            lastRoll: {
                playerName: currentPlayer.name,
                dice: newDice,
                average
            }
        });
    });
});
const PORT = 3001;
server.listen(PORT, () => {
    console.log(`🚀 Sunucu ${PORT} portunda çalışıyor...`);
});