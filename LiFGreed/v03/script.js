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

let currentBrush = { emoji: '💩', name: 'poop' };
let tooltipState = new Array(GRID_WIDTH * GRID_HEIGHT).fill(null);

function createGrid() {
    const grid = document.getElementById('grid');
    const tooltipLayer = document.getElementById('tooltipLayer');
    const savedState = localStorage.getItem(STORAGE_KEY);
    const savedTooltipState = localStorage.getItem(TOOLTIP_STORAGE_KEY);
    const gridState = savedState ? JSON.parse(savedState) : Array(GRID_WIDTH * GRID_HEIGHT).fill(0);
    tooltipState = savedTooltipState ? JSON.parse(savedTooltipState) : new Array(GRID_WIDTH * GRID_HEIGHT).fill(null);
    let isMouseDown = false;

    // Clear existing grid and tooltip layer
    grid.innerHTML = '';
    tooltipLayer.innerHTML = '';

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
        tooltipElement.style.left = `${(index % GRID_WIDTH) * (100 / GRID_WIDTH)}%`;
        tooltipElement.style.top = `${Math.floor(index / GRID_WIDTH) * (100 / GRID_HEIGHT)}%`;
        tooltipElement.style.width = `${100 / GRID_WIDTH}%`;
        tooltipElement.style.height = `${100 / GRID_HEIGHT}%`;
        
        tooltipElement.addEventListener('dblclick', function() {
            const input = document.createElement('input');
            input.type = 'text';
            input.value = value;
            input.className = 'cell-edit-input';
            input.style.width = '100%';
            input.style.height = '100%';
            input.style.textAlign = 'center';
            input.style.border = 'none';
            input.style.background = 'transparent';
            input.style.color = 'white';
            input.style.fontFamily = 'monospace';
            input.style.fontSize = '12px';
            
            tooltipElement.textContent = '';
            tooltipElement.appendChild(input);
            input.focus();
            
            function finishEditing() {
                const newValue = input.value;
                if (/^\d{3}\.\d$/.test(newValue)) {
                    tooltipElement.dataset.value = newValue;
                    tooltipElement.textContent = '';
                    tooltipState[index] = newValue;
                    saveTooltipState();
                } else {
                    tooltipElement.textContent = '';
                    tooltipElement.dataset.value = value;
                }
            }
            
            input.addEventListener('blur', finishEditing);
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    finishEditing();
                }
            });
        });
        
        tooltipLayer.appendChild(tooltipElement);
    }

    function saveGridState(state) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function saveTooltipState() {
        localStorage.setItem(TOOLTIP_STORAGE_KEY, JSON.stringify(tooltipState));
    }

    // Add brush selection functionality
    const brushButtons = document.querySelectorAll('.brush-button');
    brushButtons.forEach(button => {
        button.addEventListener('click', () => {
            brushButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            currentBrush = {
                emoji: button.dataset.emoji,
                name: button.dataset.name
            };
        });
    });

    // Create grid cells
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

        cell.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        grid.appendChild(cell);
    }

    // Create tooltip elements
    tooltipState.forEach((value, index) => {
        if (value) {
            addTooltip(index, value);
        }
    });

    // Add numeric input handling
    const numericInput = document.querySelector('.numeric-input');
    const levelButton = document.getElementById('levelButton');
    let isLevelModeActive = false;

    levelButton.addEventListener('click', function() {
        isLevelModeActive = !isLevelModeActive;
        this.classList.toggle('active');
        
        if (isLevelModeActive) {
            currentBrush = { emoji: '📊', name: 'numeric' };
            document.querySelectorAll('.brush-button').forEach(btn => btn.classList.remove('active'));
        } else {
            currentBrush = { emoji: '💩', name: 'poop' };
            document.querySelector('.brush-button[data-name="poop"]').classList.add('active');
        }
    });

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

    // Update grid click handler to use numeric input value
    grid.addEventListener('click', function(e) {
        if (isLevelModeActive && numericInput.value && /^\d{3}\.\d$/.test(numericInput.value)) {
            const cell = e.target.closest('.cell');
            if (cell) {
                const index = Array.from(cell.parentElement.children).indexOf(cell);
                const value = numericInput.value;
                
                // Remove existing tooltip if any
                const existingTooltip = tooltipLayer.querySelector(`[style*="left: ${(index % GRID_WIDTH) * (100 / GRID_WIDTH)}%"][style*="top: ${Math.floor(index / GRID_HEIGHT) * (100 / GRID_HEIGHT)}%"]`);
                if (existingTooltip) {
                    existingTooltip.remove();
                }
                
                // Add new tooltip
                addTooltip(index, value);
                tooltipState[index] = value;
                saveTooltipState();
            }
        }
    });

    // Initialize emoji counter
    updateEmojiCounter();
}

function resetGrid() {
    const gridState = Array(GRID_WIDTH * GRID_HEIGHT).fill(0);
    const tooltipState = new Array(GRID_WIDTH * GRID_HEIGHT).fill(null);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gridState));
    localStorage.setItem(TOOLTIP_STORAGE_KEY, JSON.stringify(tooltipState));
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

// Add event listeners
document.getElementById('resetButton').addEventListener('click', resetGrid);
document.getElementById('themeToggle').addEventListener('click', toggleTheme);

// Initialize the grid and theme
initTheme();
createGrid(); 