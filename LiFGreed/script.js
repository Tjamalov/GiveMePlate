const GRID_WIDTH = 60;
const GRID_HEIGHT = 40;
const ELEMENTS = [
    { emoji: '', name: 'empty' },
    { emoji: '💩', name: 'poop' },
    { emoji: '🌳', name: 'tree' },
    { emoji: '🍎', name: 'apple' },
    { emoji: '🏢', name: 'building' },
    { emoji: '🚧', name: 'construction' },
    { emoji: '🙏', name: 'prayer' },
    { emoji: '📊', name: 'numeric' }
];
const STORAGE_KEY = 'gridState';

let currentBrush = { emoji: '💩', name: 'poop' };

function createGrid() {
    const grid = document.getElementById('grid');
    const savedState = localStorage.getItem(STORAGE_KEY);
    const gridState = savedState ? JSON.parse(savedState) : Array(GRID_WIDTH * GRID_HEIGHT).fill(0);
    let isMouseDown = false;

    // Clear existing grid
    grid.innerHTML = '';

    function updateEmojiCounter() {
        const counter = document.getElementById('emojiCounter');
        counter.innerHTML = '';
        
        // Count emojis
        const emojiCounts = {};
        const cells = document.querySelectorAll('.cell');
        cells.forEach(cell => {
            const emoji = cell.textContent;
            if (emoji && emoji !== '') {
                emojiCounts[emoji] = (emojiCounts[emoji] || 0) + 1;
            }
        });

        // Create counter items
        Object.entries(emojiCounts).forEach(([emoji, count]) => {
            const item = document.createElement('div');
            item.className = 'emoji-counter-item';
            item.innerHTML = `${emoji} ${count}`;
            counter.appendChild(item);
        });
    }

    function changeCellElement(cell, index, clear = false) {
        if (clear) {
            cell.textContent = '';
            cell.className = 'cell empty';
            cell.title = ''; // Clear tooltip
            gridState[index] = 0; // 0 is the index of empty cell
        } else {
            if (currentBrush.name === 'numeric') {
                const value = numericInput.value;
                if (value && /^\d{3}\.\d$/.test(value)) {
                    cell.textContent = value;
                    cell.className = 'cell numeric';
                    cell.title = value;
                    gridState[index] = ELEMENTS.findIndex(el => el.name === 'numeric');
                } else {
                    // If value is not in correct format, don't change the cell
                    return;
                }
            } else {
                cell.textContent = currentBrush.emoji;
                cell.className = `cell ${currentBrush.name}`;
                cell.title = ''; // Clear tooltip for non-numeric cells
                gridState[index] = ELEMENTS.findIndex(el => el.emoji === currentBrush.emoji);
            }
        }
        saveGridState(gridState);
        updateEmojiCounter();
    }

    // Add brush selection functionality
    const brushButtons = document.querySelectorAll('.brush-button');
    brushButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons
            brushButtons.forEach(btn => btn.classList.remove('active'));
            // Add active class to clicked button
            button.classList.add('active');
            // Update current brush
            currentBrush = {
                emoji: button.dataset.emoji,
                name: button.dataset.name
            };
        });
    });

    for (let i = 0; i < GRID_WIDTH * GRID_HEIGHT; i++) {
        const cell = document.createElement('div');
        cell.className = `cell ${ELEMENTS[gridState[i]].name}`;
        cell.textContent = ELEMENTS[gridState[i]].emoji;
        
        cell.addEventListener('mousedown', (e) => {
            e.preventDefault();
            if (e.button === 0) { // Left click
                isMouseDown = true;
                changeCellElement(cell, i);
            } else if (e.button === 2) { // Right click
                isMouseDown = true;
                changeCellElement(cell, i, true);
            }
        });

        cell.addEventListener('mouseenter', (e) => {
            if (isMouseDown) {
                if (e.buttons === 1) { // Left button pressed
                    changeCellElement(cell, i);
                } else if (e.buttons === 2) { // Right button pressed
                    changeCellElement(cell, i, true);
                }
            }
        });

        // Prevent context menu
        cell.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        grid.appendChild(cell);
    }

    // Add mouse event listeners to the document to handle mouse up outside the grid
    document.addEventListener('mouseup', () => {
        isMouseDown = false;
    });

    // Prevent text selection while dragging
    document.addEventListener('selectstart', (e) => {
        if (isMouseDown) {
            e.preventDefault();
        }
    });

    // Initialize emoji counter
    updateEmojiCounter();
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
    const gridState = Array(GRID_WIDTH * GRID_HEIGHT).fill(0);
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