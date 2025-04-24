const GRID_WIDTH = 60;
const GRID_HEIGHT = 40;
const ELEMENTS = [
    { emoji: '🌱', name: 'Plant' },
    { emoji: '🔥', name: 'Fire' },
    { emoji: '💧', name: 'Water' },
    { emoji: '🌬️', name: 'Air' },
    { emoji: '🌍', name: 'Earth' },
    { emoji: '⚡', name: 'Lightning' },
    { emoji: '❄️', name: 'Ice' },
    { emoji: '🌪️', name: 'Wind' },
    { emoji: '🌊', name: 'Wave' },
    { emoji: '🌋', name: 'Lava' },
    { emoji: '🌫️', name: 'Fog' },
    { emoji: '🌩️', name: 'Storm' },
    { emoji: '🌧️', name: 'Rain' },
    { emoji: '🌤️', name: 'Cloud' },
    { emoji: '🌞', name: 'Sun' },
    { emoji: '🌙', name: 'Moon' },
    { emoji: '⭐', name: 'Star' },
    { emoji: '🌠', name: 'Shooting Star' },
    { emoji: '🌈', name: 'Rainbow' },
    { emoji: '🌪️', name: 'Tornado' },
    { emoji: '🌊', name: 'Tsunami' },
    { emoji: '🌋', name: 'Volcano' },
    { emoji: '🌫️', name: 'Mist' },
    { emoji: '🌩️', name: 'Thunder' },
    { emoji: '🌧️', name: 'Drizzle' },
    { emoji: '🌤️', name: 'Partly Cloudy' },
    { emoji: '🌞', name: 'Sunny' },
    { emoji: '🌙', name: 'Crescent Moon' },
    { emoji: '⭐', name: 'Glowing Star' },
    { emoji: '🌠', name: 'Meteor' }
];
const STORAGE_KEY = 'lifgreed_grid';

function createGrid() {
    const grid = document.getElementById('grid');
    grid.innerHTML = '';
    grid.style.gridTemplateColumns = `repeat(${GRID_WIDTH}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${GRID_HEIGHT}, 1fr)`;

    const savedGrid = localStorage.getItem(STORAGE_KEY);
    const gridState = savedGrid ? JSON.parse(savedGrid) : Array(GRID_WIDTH * GRID_HEIGHT).fill(null);

    for (let i = 0; i < GRID_WIDTH * GRID_HEIGHT; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.index = i;
        cell.addEventListener('click', () => changeCellElement(cell, i));
        cell.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            clearCell(cell, i);
        });

        if (gridState[i]) {
            cell.textContent = gridState[i].emoji;
            cell.title = gridState[i].name;
        }

        grid.appendChild(cell);
    }

    updateEmojiCounters();
}

function changeCellElement(cell, index) {
    const currentEmoji = cell.textContent;
    const currentIndex = ELEMENTS.findIndex(e => e.emoji === currentEmoji);
    const nextIndex = (currentIndex + 1) % ELEMENTS.length;
    const nextElement = ELEMENTS[nextIndex];

    cell.textContent = nextElement.emoji;
    cell.title = nextElement.name;

    const gridState = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    gridState[index] = nextElement;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gridState));

    updateEmojiCounters();
}

function clearCell(cell, index) {
    cell.textContent = '';
    cell.title = '';

    const gridState = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    gridState[index] = null;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gridState));

    updateEmojiCounters();
}

function updateEmojiCounters() {
    const counters = {};
    ELEMENTS.forEach(element => {
        counters[element.emoji] = 0;
    });

    const cells = document.querySelectorAll('.cell');
    cells.forEach(cell => {
        const emoji = cell.textContent;
        if (emoji && counters.hasOwnProperty(emoji)) {
            counters[emoji]++;
        }
    });

    const counterContainer = document.getElementById('emoji-counters');
    counterContainer.innerHTML = '';

    Object.entries(counters).forEach(([emoji, count]) => {
        if (count > 0) {
            const counter = document.createElement('div');
            counter.className = 'emoji-counter';
            counter.textContent = `${emoji}: ${count}`;
            counterContainer.appendChild(counter);
        }
    });
}

function saveGridState(state) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        console.error('Error saving grid state:', e);
    }
}

function getCurrentGridState() {
    const cells = document.querySelectorAll('.cell');
    return Array.from(cells).map(cell => 
        ELEMENTS.findIndex(el => cell.textContent === el.emoji)
    );
}

function loadGridState(state) {
    const cells = document.querySelectorAll('.cell');
    cells.forEach((cell, index) => {
        const elementIndex = state[index];
        cell.textContent = ELEMENTS[elementIndex].emoji;
        cell.className = `cell ${ELEMENTS[elementIndex].name}`;
    });
    saveGridState(state);
}

async function saveToFile() {
    try {
        const state = getCurrentGridState();
        const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
        
        // Try to use the File System Access API
        if ('showSaveFilePicker' in window) {
            const options = {
                types: [{
                    description: 'JSON Files',
                    accept: {
                        'application/json': ['.json']
                    }
                }],
                suggestedName: 'grid-notebook.json'
            };
            
            const handle = await window.showSaveFilePicker(options);
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
        } else {
            // Fallback for browsers that don't support File System Access API
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'grid-notebook.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    } catch (err) {
        console.error('Error saving file:', err);
        // If user cancels the save dialog, we don't need to show an error
        if (err.name !== 'AbortError') {
            alert('Error saving file. Please try again.');
        }
    }
}

function loadFromFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const state = JSON.parse(e.target.result);
            if (Array.isArray(state) && state.length === GRID_WIDTH * GRID_HEIGHT) {
                loadGridState(state);
            } else {
                alert('Invalid file format');
            }
        } catch (e) {
            alert('Error loading file');
        }
    };
    reader.readAsText(file);
}

function generateShareLink() {
    const state = getCurrentGridState();
    const base64State = btoa(JSON.stringify(state));
    const url = new URL(window.location.href);
    url.searchParams.set('state', base64State);
    
    // Copy to clipboard
    navigator.clipboard.writeText(url.toString())
        .then(() => alert('Link copied to clipboard!'))
        .catch(() => {
            // Fallback if clipboard API is not available
            const textarea = document.createElement('textarea');
            textarea.value = url.toString();
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            alert('Link copied to clipboard!');
        });
}

// Load state from URL if present
function loadStateFromUrl() {
    const url = new URL(window.location.href);
    const base64State = url.searchParams.get('state');
    if (base64State) {
        try {
            const state = JSON.parse(atob(base64State));
            if (Array.isArray(state) && state.length === GRID_WIDTH * GRID_HEIGHT) {
                loadGridState(state);
            }
        } catch (e) {
            console.error('Error loading state from URL:', e);
        }
    }
}

function resetGrid() {
    const gridState = Array(GRID_WIDTH * GRID_HEIGHT).fill(null);
    loadGridState(gridState);
}

// Add event listeners for new buttons
document.getElementById('resetButton').addEventListener('click', resetGrid);
document.getElementById('saveButton').addEventListener('click', saveToFile);
document.getElementById('shareButton').addEventListener('click', generateShareLink);
document.getElementById('loadFile').addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        loadFromFile(e.target.files[0]);
    }
});

function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
    const themeToggle = document.getElementById('themeToggle');
    themeToggle.textContent = isDark ? '🌙' : '☀️';
    localStorage.setItem('theme', isDark ? 'light' : 'dark');
}

// Initialize theme
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    const themeToggle = document.getElementById('themeToggle');
    themeToggle.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
}

// Add event listener for theme toggle
document.getElementById('themeToggle').addEventListener('click', toggleTheme);

// Initialize the grid and theme when the page loads
initTheme();
loadStateFromUrl();
createGrid();

// Add event listener for tooltip input validation
document.getElementById('tooltipValue').addEventListener('input', function(e) {
    const value = e.target.value;
    if (!/^\d{0,3}(\.\d{0,1})?$/.test(value)) {
        e.target.value = value.slice(0, -1);
    }
});

// Add numeric input handling
const numericInput = document.querySelector('.numeric-input');
numericInput.addEventListener('input', function(e) {
    let value = e.target.value.replace(/[^\d]/g, '');
    if (value.length > 3) {
        value = value.slice(0, 3) + '.' + value.slice(3, 4);
    }
    e.target.value = value;
    
    // Validate input format
    if (!/^\d{3}\.\d$/.test(value)) {
        e.target.style.borderColor = 'red';
    } else {
        e.target.style.borderColor = '';
    }
    
    // Update active cell if numeric brush is selected
    if (currentBrush.name === 'numeric') {
        const activeCell = document.querySelector('.cell.active');
        if (activeCell) {
            const index = Array.from(activeCell.parentElement.children).indexOf(activeCell);
            changeCellElement(activeCell, index);
        }
    }
});

// Add cell editing functionality
document.getElementById('grid').addEventListener('dblclick', function(e) {
    const cell = e.target.closest('.cell');
    if (cell && cell.classList.contains('numeric')) {
        const currentValue = cell.textContent;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentValue;
        input.className = 'cell-edit-input';
        input.style.width = '100%';
        input.style.height = '100%';
        input.style.textAlign = 'center';
        input.style.border = 'none';
        input.style.background = 'transparent';
        input.style.color = 'white';
        input.style.fontFamily = 'monospace';
        input.style.fontSize = '12px';
        
        cell.textContent = '';
        cell.appendChild(input);
        input.focus();
        
        function finishEditing() {
            const newValue = input.value;
            if (/^\d{3}\.\d$/.test(newValue)) {
                cell.textContent = newValue;
                cell.title = newValue;
                const index = Array.from(cell.parentElement.children).indexOf(cell);
                gridState[index] = ELEMENTS.findIndex(el => el.name === 'numeric');
                saveGridState(gridState);
            } else {
                cell.textContent = currentValue;
                cell.title = currentValue;
            }
        }
        
        input.addEventListener('blur', finishEditing);
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                finishEditing();
            }
        });
    }
}); 