const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

let globalRoom = {
    players: {},
    numbersCalled: [],
    gameStarted: false,
    interval: null,
    pot: 0
};

io.on('connection', (socket) => {
    console.log('Bir oyunçu qoşuldu:', socket.id);

    socket.on('join_game', ({ username, pin }) => {
        if (pin !== '666') {
            socket.emit('error_msg', 'Yanlış şifrə! Şifrə 666 olmalıdır.');
            return;
        }

        let currentPlayersCount = Object.keys(globalRoom.players).length;
        if (currentPlayersCount >= 6 && !globalRoom.players[socket.id]) {
            socket.emit('error_msg', 'Otaq doludur! Maksimum 6 nəfər qoşula bilər.');
            return;
        }

        if (!globalRoom.players[socket.id]) {
            globalRoom.players[socket.id] = {
                username: username,
                balance: 0.00,
                cards: [],
                markedNumbers: []
            };
        }

        socket.emit('joined_success');
        io.emit('update_players', globalRoom.players);
        socket.emit('balance_update', globalRoom.players[socket.id].balance);
        socket.emit('update_pot', globalRoom.pot);
    });

    socket.on('submit_deposit', ({ amount }) => {
        let player = globalRoom.players[socket.id];
        if (player) {
            let depAmount = parseFloat(amount) || 0;
            if (depAmount > 0) {
                socket.emit('info_msg', 'Çekiniz qəbul olundu. Yoxlanılır...');
                
                setTimeout(() => {
                    player.balance += depAmount;
                    io.emit('update_players', globalRoom.players);
                    socket.emit('balance_update', player.balance);
                    socket.emit('info_msg', `${depAmount.toFixed(2)} AZN balansınıza əlavə olundu!`);
                }, 2000);
            }
        }
    });

    socket.on('buy_card', () => {
        let player = globalRoom.players[socket.id];
        
        if (player && !globalRoom.gameStarted) {
            if (player.balance >= 0.50) {
                player.balance -= 0.50;
                globalRoom.pot += 0.50;
                
                let newCard = generateCard();
                player.cards.push(newCard);
                
                socket.emit('my_cards', player.cards);
                socket.emit('balance_update', player.balance);
                io.emit('update_pot', globalRoom.pot);
                io.emit('update_players', globalRoom.players);
            } else {
                socket.emit('error_msg', 'Balansınız kifayət etmir! Zəhmət olmasa depozit edin.');
            }
        }
    });

    socket.on('start_game', () => {
        if (!globalRoom.gameStarted) {
            let activePlayers = Object.values(globalRoom.players);
            if (activePlayers.length === 0) return;

            globalRoom.gameStarted = true;
            globalRoom.numbersCalled = [];

            io.emit('game_started', globalRoom.pot);
            io.emit('update_players', globalRoom.players);

            globalRoom.interval = setInterval(() => {
                if (globalRoom.numbersCalled.length >= 90) {
                    clearInterval(globalRoom.interval);
                    globalRoom.gameStarted = false;
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

    socket.on('mark_number', ({ cardIndex, number }) => {
        let player = globalRoom.players[socket.id];

        if (globalRoom.gameStarted && player && player.cards[cardIndex]) {
            if (globalRoom.numbersCalled.includes(number)) {
                if (!player.markedNumbers.includes(number)) {
                    player.markedNumbers.push(number);
                }

                let card = player.cards[cardIndex];
                let cardNumbers = card.flat().filter(n => n !== null);
                let markedOnThisCard = cardNumbers.every(n => player.markedNumbers.includes(n));

                if (markedOnThisCard) {
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
             
