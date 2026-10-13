const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let globalRoom = {
    players: {},
    numbersCalled: [],
    gameStarted: false,
    interval: null,
    pot: 0
};

io.on('connection', (socket) => {
    console.log('Bir oyunçu qoşuldu:', socket.id);

    socket.on('join_game', ({ username, balance, pin }) => {
        if (pin !== '666') {
            socket.emit('error_msg', 'Yanlış şifrə! Şifrə 666 olmalıdır.');
            return;
        }

        let initBalance = parseFloat(balance) || 0;
        if (initBalance < 0.50) {
            socket.emit('error_msg', 'Oyuna qoşulmaq və kart almaq üçün balansınızda ən azı 0.50 AZN olmalıdır!');
            return;
        }

        globalRoom.players[socket.id] = {
            username: username,
            balance: initBalance,
            card: generateCard(),
            markedNumbers: []
        };

        socket.emit('joined_success');
        io.emit('update_players', globalRoom.players);
        socket.emit('my_card', globalRoom.players[socket.id].card);
        socket.emit('balance_update', globalRoom.players[socket.id].balance);
        socket.emit('update_pot', globalRoom.pot);
    });

    socket.on('update_balance_backend', ({ newBalance }) => {
        let player = globalRoom.players[socket.id];
        if (player) {
            player.balance = parseFloat(newBalance);
            io.emit('update_players', globalRoom.players);
            socket.emit('balance_update', player.balance);
        }
    });

    socket.on('buy_card', () => {
        let player = globalRoom.players[socket.id];
        
        if (player && !globalRoom.gameStarted) {
            if (player.balance >= 0.50) {
                player.balance -= 0.50;
                globalRoom.pot += 0.50;
                player.card = generateCard(); 
                player.markedNumbers = [];
                
                socket.emit('my_card', player.card);
                socket.emit('balance_update', player.balance);
                io.emit('update_pot', globalRoom.pot);
                io.emit('update_players', globalRoom.players);
            } else {
                socket.emit('error_msg', 'Balansınız 0.50 AZN-dən azdır! Depozit edin.');
            }
        }
    });

    socket.on('start_game', () => {
        if (!globalRoom.gameStarted) {
            let totalPot = 0;
            for (let id in globalRoom.players) {
                if (globalRoom.players[id].balance >= 0.50) {
                    globalRoom.players[id].balance -= 0.50;
                    totalPot += 0.50;
                }
            }
            globalRoom.pot = totalPot;
            globalRoom.gameStarted = true;
            globalRoom.numbersCalled = [];

            io.emit('game_started', globalRoom.pot);
            io.emit('update_players', globalRoom.players);

            globalRoom.interval = setInterval(() => {
                if (globalRoom.numbersCalled.length >= 90) {
                    clearInterval(globalRoom.interval);
                    return;
                }

                let randomNum;
                do {
                    randomNum = Math.floor(Math.random() * 90) + 1;
                } while (globalRoom.numbersCalled.includes(randomNum));

                globalRoom.numbersCalled.push(randomNum);
                io.emit('number_called', { number: randomNum, allCalled: globalRoom.numbersCalled });

            }, 3000);
        }
    });

    socket.on('mark_number', ({ number }) => {
        let player = globalRoom.players[socket.id];

        if (globalRoom.gameStarted && player) {
            if (globalRoom.numbersCalled.includes(number) && !player.markedNumbers.includes(number)) {
                player.markedNumbers.push(number);

                if (player.markedNumbers.length >= player.card.flat().filter(n => n !== null).length) {
                    clearInterval(globalRoom.interval);
                    globalRoom.gameStarted = false;

                    let commission = 0.50;
                    let prize = globalRoom.pot - commission;
                    if (prize < 0) prize = 0;

                    player.balance += prize;
                    io.emit('game_won', { winner: player.username, prize: prize.toFixed(2) });
                    io.emit('update_players', globalRoom.players);
                    socket.emit('balance_update', player.balance);
                    
                    globalRoom.pot = 0;
                    io.emit('update_pot', globalRoom.pot);
                }
            }
        }
    });

    socket.on('disconnect', () => {
        if (globalRoom.players[socket.id]) {
            delete globalRoom.players[socket.id];
            io.emit('update_players', globalRoom.players);
            if (Object.keys(globalRoom.players).length === 0) {
                clearInterval(globalRoom.interval);
                globalRoom.gameStarted = false;
                globalRoom.pot = 0;
            }
        }
        console.log('Oyunçu çıxdı:', socket.id);
    });
});

function generateCard() {
    let card = Array(3).fill(null).map(() => Array(9).fill(null));
    for (let col = 0; col < 9; col++) {
        let min = col * 10 + 1;
        let max = col === 8 ? 90 : (col + 1) * 10;
        let colNums = [];
        while (colNums.length < 3) {
            let n = Math.floor(Math.random() * (max - min + 1)) + min;
            if (!colNums.includes(n)) colNums.push(n);
        }
        colNums.sort((a, b) => a - b);
        for (let row = 0; row < 3; row++) {
            card[row][col] = colNums[row];
        }
    }
    return card;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server işləyir: http://localhost:${PORT}`);
});
          
