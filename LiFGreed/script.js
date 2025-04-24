const grid = document.getElementById('grid');
const emojiCounters = document.getElementById('emoji-counters');
const emojis = ['🌳', '🍎', '🏠', '🏗️', '💩', '🙏'];
const counts = {};
let currentBrush = null;

// Initialize counters
emojis.forEach(emoji => {
    counts[emoji] = 0;
    const counter = document.createElement('div');
    counter.className = 'emoji-counter';
    counter.innerHTML = `
        <span>${emoji}</span>
        <span class="count">0</span>
    `;
    emojiCounters.appendChild(counter);
});

// Create grid cells
for (let i = 0; i < 100; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.textContent = '⬜';
    cell.dataset.type = 'empty';
    
    cell.addEventListener('click', () => {
        if (currentBrush) {
            if (cell.dataset.type === 'empty') {
                counts[currentBrush]++;
            } else if (cell.dataset.type !== currentBrush) {
                counts[cell.dataset.type]--;
                counts[currentBrush]++;
            }
            cell.textContent = currentBrush;
            cell.dataset.type = currentBrush;
            updateCounter(currentBrush);
            if (cell.dataset.type !== 'empty') {
                updateCounter(cell.dataset.type);
            }
        }
    });
    
    grid.appendChild(cell);
}

function updateCounter(emoji) {
    const counter = Array.from(emojiCounters.children).find(
        el => el.querySelector('span').textContent === emoji
    );
    if (counter) {
        counter.querySelector('.count').textContent = counts[emoji];
    }
}

// Brush selector functionality
const brushButtons = document.querySelectorAll('.brush-button');
brushButtons.forEach(button => {
    button.addEventListener('click', () => {
        brushButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        currentBrush = button.dataset.emoji;
    });
});

// Reset button functionality
document.getElementById('resetButton').addEventListener('click', () => {
    const cells = document.querySelectorAll('.cell');
    cells.forEach(cell => {
        cell.textContent = '⬜';
        cell.dataset.type = 'empty';
    });
    emojis.forEach(emoji => {
        counts[emoji] = 0;
        updateCounter(emoji);
    });
});

// Save button functionality
document.getElementById('saveButton').addEventListener('click', () => {
    const gridState = Array.from(document.querySelectorAll('.cell')).map(cell => ({
        type: cell.dataset.type,
        content: cell.textContent
    }));
    const blob = new Blob([JSON.stringify(gridState)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'grid-state.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

// Load button functionality
document.getElementById('loadFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const gridState = JSON.parse(e.target.result);
                const cells = document.querySelectorAll('.cell');
                cells.forEach((cell, index) => {
                    if (index < gridState.length) {
                        cell.textContent = gridState[index].content;
                        cell.dataset.type = gridState[index].type;
                    }
                });
                // Update counters
                emojis.forEach(emoji => {
                    counts[emoji] = 0;
                });
                cells.forEach(cell => {
                    if (cell.dataset.type !== 'empty') {
                        counts[cell.dataset.type]++;
                    }
                });
                emojis.forEach(emoji => {
                    updateCounter(emoji);
                });
            } catch (error) {
                console.error('Error loading file:', error);
            }
        };
        reader.readAsText(file);
    }
});

// Share button functionality
document.getElementById('shareButton').addEventListener('click', () => {
    const gridState = Array.from(document.querySelectorAll('.cell')).map(cell => ({
        type: cell.dataset.type,
        content: cell.textContent
    }));
    const base64State = btoa(JSON.stringify(gridState));
    const url = new URL(window.location.href);
    url.searchParams.set('state', base64State);
    navigator.clipboard.writeText(url.toString())
        .then(() => alert('Ссылка скопирована в буфер обмена!'))
        .catch(() => alert('Не удалось скопировать ссылку'));
});

// Theme toggle functionality
document.getElementById('themeToggle').addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
    document.getElementById('themeToggle').textContent = isDark ? '🌙' : '☀️';
    localStorage.setItem('theme', isDark ? 'light' : 'dark');
});

// Load theme from localStorage
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);
document.getElementById('themeToggle').textContent = savedTheme === 'dark' ? '☀️' : '🌙';

// Load state from URL if present
const urlParams = new URLSearchParams(window.location.search);
const stateParam = urlParams.get('state');
if (stateParam) {
    try {
        const gridState = JSON.parse(atob(stateParam));
        const cells = document.querySelectorAll('.cell');
        cells.forEach((cell, index) => {
            if (index < gridState.length) {
                cell.textContent = gridState[index].content;
                cell.dataset.type = gridState[index].type;
            }
        });
        // Update counters
        emojis.forEach(emoji => {
            counts[emoji] = 0;
        });
        cells.forEach(cell => {
            if (cell.dataset.type !== 'empty') {
                counts[cell.dataset.type]++;
            }
        });
        emojis.forEach(emoji => {
            updateCounter(emoji);
        });
    } catch (error) {
        console.error('Error loading state from URL:', error);
    }
} 