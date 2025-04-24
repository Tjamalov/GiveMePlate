const GRID_WIDTH = 60;
const GRID_HEIGHT = 40;
const ELEMENTS = [
    { emoji: '', name: 'empty' },
    { emoji: '💩', name: 'poop' },
    { emoji: '🌳', name: 'tree' },
    { emoji: '🍎', name: 'apple' },
    { emoji: '🏢', name: 'building' },
    { emoji: '🚧', name: 'construction' },
    { emoji: '🙏', name: 'prayer' }
];
const STORAGE_KEY = 'gridState';
const TOOLTIP_STORAGE_KEY = 'tooltipState';

// Global state variables
let currentBrush = { emoji: '💩', name: 'poop' };
let gridState;
let tooltipState;

// Initialize state from localStorage or URL
function initializeState() {
    const savedState = localStorage.getItem(STORAGE_KEY);
    const savedTooltipState = localStorage.getItem(TOOLTIP_STORAGE_KEY);
    const hasURLState = loadStateFromURL();

    if (!hasURLState) {
        gridState = savedState ? JSON.parse(savedState) : Array(GRID_WIDTH * GRID_HEIGHT).fill(0);
        tooltipState = savedTooltipState ? JSON.parse(savedTooltipState) : new Array(GRID_WIDTH * GRID_HEIGHT).fill(null);
    }
}

// Load state from URL if present
function loadStateFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const stateParam = urlParams.get('state');
    
    if (stateParam) {
        try {
            const state = JSON.parse(atob(stateParam));
            if (state.grid && state.tooltips) {
                gridState = state.grid;
                tooltipState = state.tooltips;
                return true;
            }
        } catch (e) {
            console.error('Failed to load state from URL:', e);
        }
    }
    return false;
}

// Initialize state
initializeState();

function createGrid() {
    const grid = document.getElementById('grid');
    const tooltipLayer = document.getElementById('tooltipLayer');
    let isMouseDown = false;
    let isRightMouseDown = false;

    // Initialize brushes
    currentBrush = { emoji: '💩', name: 'poop' };
    let isLevelModeActive = false;

    // Clear existing grid and tooltip layer
    grid.innerHTML = '';
    tooltipLayer.innerHTML = '';

    // Force grid dimensions
    grid.style.width = '100%';
    grid.style.height = '100%';
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = `repeat(${GRID_WIDTH}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${GRID_HEIGHT}, 1fr)`;

    // Create grid cells using global gridState
    for (let i = 0; i < GRID_WIDTH * GRID_HEIGHT; i++) {
        const cell = document.createElement('div');
        cell.className = `cell ${ELEMENTS[gridState[i]].name}`;
        cell.textContent = ELEMENTS[gridState[i]].emoji;
        grid.appendChild(cell);
    }

    // Create tooltip elements using global tooltipState
    tooltipState.forEach((value, index) => {
        if (value) {
            addTooltip(index, value);
        }
    });

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
            gridState[index] = 0;
        } else {
            cell.textContent = currentBrush.emoji;
            cell.className = `cell ${currentBrush.name}`;
            gridState[index] = ELEMENTS.findIndex(el => el.emoji === currentBrush.emoji);
        }
        saveGridState(gridState);
        updateEmojiCounter();
    }

    function addTooltip(index, value) {
        const tooltipElement = document.createElement('div');
        tooltipElement.className = 'tooltip-element';
        tooltipElement.dataset.value = value;
        tooltipElement.dataset.index = index;
        tooltipElement.style.left = `${(index % GRID_WIDTH) * (100 / GRID_WIDTH)}%`;
        tooltipElement.style.top = `${Math.floor(index / GRID_WIDTH) * (100 / GRID_HEIGHT)}%`;
        tooltipElement.style.width = `${100 / GRID_WIDTH}%`;
        tooltipElement.style.height = `${100 / GRID_HEIGHT}%`;
        
        tooltipLayer.appendChild(tooltipElement);
    }

    function saveGridState(state) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function saveTooltipState() {
        localStorage.setItem(TOOLTIP_STORAGE_KEY, JSON.stringify(tooltipState));
    }

    // Handle mouse events for the grid
    grid.addEventListener('mousedown', function(e) {
        e.preventDefault();
        const cell = e.target.closest('.cell');
        if (!cell) return;

        const index = Array.from(cell.parentElement.children).indexOf(cell);
        
        if (e.button === 0) { // Left click
            isMouseDown = true;
            if (isLevelModeActive) {
                addTooltipToCell(cell, index);
            } else {
                changeCellElement(cell, index);
            }
        } else if (e.button === 2) { // Right click
            isRightMouseDown = true;
            clearCell(cell, index);
        }
    });

    grid.addEventListener('mouseup', function(e) {
        if (e.button === 0) {
            isMouseDown = false;
        } else if (e.button === 2) {
            isRightMouseDown = false;
        }
    });

    grid.addEventListener('mousemove', function(e) {
        const cell = e.target.closest('.cell');
        if (!cell) return;

        const index = Array.from(cell.parentElement.children).indexOf(cell);
        
        if (isMouseDown && e.buttons === 1) { // Left button pressed
            if (isLevelModeActive) {
                addTooltipToCell(cell, index);
            } else {
                changeCellElement(cell, index);
            }
        } else if (isRightMouseDown && e.buttons === 2) { // Right button pressed
            clearCell(cell, index);
        }
    });

    grid.addEventListener('contextmenu', function(e) {
        e.preventDefault();
    });

    // Handle mouse events for tooltips
    tooltipLayer.addEventListener('mousedown', function(e) {
        e.preventDefault();
        const tooltip = e.target.closest('.tooltip-element');
        if (!tooltip) return;

        const index = parseInt(tooltip.dataset.index);
        const cell = grid.children[index];
        
        if (e.button === 2) { // Right click
            isRightMouseDown = true;
            clearCell(cell, index);
        }
    });

    tooltipLayer.addEventListener('mouseup', function(e) {
        if (e.button === 2) {
            isRightMouseDown = false;
        }
    });

    tooltipLayer.addEventListener('mousemove', function(e) {
        if (isRightMouseDown && e.buttons === 2) {
            const tooltip = e.target.closest('.tooltip-element');
            if (!tooltip) return;

            const index = parseInt(tooltip.dataset.index);
            const cell = grid.children[index];
            clearCell(cell, index);
        }
    });

    tooltipLayer.addEventListener('contextmenu', function(e) {
        e.preventDefault();
    });

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
            
            // Deactivate Level mode if it was active
            if (isLevelModeActive) {
                isLevelModeActive = false;
                levelButton.classList.remove('active');
            }
        });
    });

    // Add numeric input handling
    const numericInput = document.querySelector('.numeric-input');
    const levelButton = document.getElementById('levelButton');

    levelButton.addEventListener('click', function() {
        isLevelModeActive = !isLevelModeActive;
        this.classList.toggle('active');
        
        if (isLevelModeActive) {
            // Don't change currentBrush in Level mode
            document.querySelectorAll('.brush-button').forEach(btn => btn.classList.remove('active'));
        } else {
            currentBrush = { emoji: '💩', name: 'poop' };
            document.querySelector('.brush-button[data-name="poop"]').classList.add('active');
        }
    });

    // Helper function to add tooltip to cell
    function addTooltipToCell(cell, index) {
        const value = numericInput.value;
        
        // Remove existing tooltip if any
        const existingTooltip = tooltipLayer.querySelector(`[data-index="${index}"]`);
        if (existingTooltip) {
            existingTooltip.remove();
        }
        
        // Add new tooltip with current input value
        addTooltip(index, value);
        tooltipState[index] = value;
        saveTooltipState();
    }

    // Helper function to clear cell completely
    function clearCell(cell, index) {
        // Clear emoji
        cell.textContent = '';
        cell.className = 'cell empty';
        gridState[index] = 0;
        
        // Clear tooltip if exists
        const existingTooltip = tooltipLayer.querySelector(`[data-index="${index}"]`);
        if (existingTooltip) {
            existingTooltip.remove();
        }
        tooltipState[index] = null;
        
        // Save changes
        saveGridState(gridState);
        saveTooltipState();
    }

    numericInput.addEventListener('input', function(e) {
        let value = e.target.value.replace(/[^\d]/g, '');
        
        // Insert decimal point after 3 digits
        if (value.length > 3) {
            value = value.slice(0, 3) + '.' + value.slice(3, 4);
        }
        
        // Update input value
        e.target.value = value;
        
        // Validate format
        if (!/^\d{3}\.\d$/.test(value) && value.length > 0) {
            e.target.style.borderColor = 'red';
        } else {
            e.target.style.borderColor = '';
        }
    });

    // Prevent non-numeric input
    numericInput.addEventListener('keypress', function(e) {
        if (!/\d/.test(e.key) && e.key !== 'Backspace' && e.key !== 'Delete') {
            e.preventDefault();
        }
    });

    numericInput.addEventListener('click', function() {
        if (!isLevelModeActive) {
            levelButton.click();
        }
    });

    // Initialize emoji counter
    updateEmojiCounter();
}

function resetGrid() {
    // Reset global state variables
    gridState = Array(GRID_WIDTH * GRID_HEIGHT).fill(0);
    tooltipState = new Array(GRID_WIDTH * GRID_HEIGHT).fill(null);
    
    // Save to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gridState));
    localStorage.setItem(TOOLTIP_STORAGE_KEY, JSON.stringify(tooltipState));
    
    // Recreate the grid
    createGrid();
}

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

// Add button event listeners
document.getElementById('resetButton').addEventListener('click', resetGrid);
document.getElementById('shareButton').addEventListener('click', shareGrid);
document.getElementById('saveButton').addEventListener('click', saveGrid);
document.getElementById('loadFile').addEventListener('change', loadGrid);
document.getElementById('themeToggle').addEventListener('click', toggleTheme);

// Share grid state via URL
function shareGrid() {
    const state = {
        grid: gridState,
        tooltips: tooltipState
    };
    const encodedState = btoa(JSON.stringify(state));
    const url = `${window.location.origin}${window.location.pathname}?state=${encodedState}`;
    
    // Copy to clipboard
    navigator.clipboard.writeText(url).then(() => {
        alert('Link copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy link:', err);
        alert('Failed to copy link. Please try again.');
    });
}

// Save grid state to file
async function saveGrid() {
    try {
        const state = {
            grid: gridState,
            tooltips: tooltipState
        };
        
        console.log('Saving state:', state);
        
        // Create file content
        const content = JSON.stringify(state, null, 2);
        
        // Create file handle
        const options = {
            suggestedName: 'lifgrid.json',
            types: [{
                description: 'JSON Files',
                accept: {
                    'application/json': ['.json']
                }
            }]
        };
        
        const handle = await window.showSaveFilePicker(options);
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
    } catch (err) {
        // If user cancelled the save dialog
        if (err.name !== 'AbortError') {
            console.error('Error saving file:', err);
            alert('Failed to save file. Please try again.');
        }
    }
}

// Load grid state from file
function loadGrid(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Check if file is JSON
    if (!file.name.endsWith('.json')) {
        alert('Please select a JSON file');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const state = JSON.parse(e.target.result);
            console.log('Loaded state:', state);
            
            if (state.grid && state.tooltips) {
                // Update global state variables
                gridState = [...state.grid]; // Create a new array to ensure proper state update
                tooltipState = [...state.tooltips]; // Create a new array to ensure proper state update
                
                console.log('Updated gridState:', gridState);
                console.log('Updated tooltipState:', tooltipState);
                
                // Save to localStorage
                localStorage.setItem(STORAGE_KEY, JSON.stringify(gridState));
                localStorage.setItem(TOOLTIP_STORAGE_KEY, JSON.stringify(tooltipState));
                
                // Clear existing grid and tooltip layer
                const grid = document.getElementById('grid');
                const tooltipLayer = document.getElementById('tooltipLayer');
                grid.innerHTML = '';
                tooltipLayer.innerHTML = '';
                
                // Recreate the grid with new state
                createGrid();
            } else {
                alert('Invalid grid state file');
            }
        } catch (err) {
            console.error('Failed to load grid state:', err);
            alert('Failed to load grid state. Please check the file format.');
        }
    };
    reader.onerror = function() {
        alert('Error reading file');
    };
    reader.readAsText(file);
}

// Initialize the grid and theme
initTheme();
createGrid(); 