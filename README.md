# AutoCurate: Regular Expression to Finite Automata Visualizer

Name: ABHISHEK GANDHI
Roll No: 2024UCA1940
Class: CSAI 2
Project Number: 4
Project Title: Regular Expression to Automata Converter

## About the Project

AutoCurate is an interactive web-based educational platform designed to visualize the complete conversion pipeline from regular expressions to various forms of finite automata. This project was developed as part of a Theory of Computation course to provide students and educators with a comprehensive tool for understanding the theoretical foundations and practical implementations of automata theory.

The application demonstrates the step-by-step transformation process from a regular expression through epsilon-NFA, NFA, DFA, and finally to a minimized DFA, with detailed visualizations and explanations at each stage.

### Course Information
- **Course**: Theory of Automata and Formal Language
- **Project Type**: Educational Visualization Tool
- **Implementation**: Pure HTML, CSS, and JavaScript (No frameworks or build tools)

---

## Regular Expression to Finite Automata Conversion

### Thompson's Construction Algorithm

The core of this project implements Thompson's Construction, a method for converting regular expressions into epsilon-NFAs (ε-NFAs). Thompson's Construction, introduced by Ken Thompson in 1968, provides a systematic approach to building NFAs from regular expressions using the following rules:

#### 1. Empty Expression (ε)
Creates a simple transition from start to accept state with epsilon (empty string).

#### 2. Symbol (a)
Creates a transition from start to accept state labeled with the symbol.

#### 3. Union Expression (a|b)
Creates parallel paths for each alternative, connected by epsilon transitions from a new start state and to a new accept state.

#### 4. Concatenation Expression (ab)
Connects the accept state of the first NFA to the start state of the second NFA using an epsilon transition.

#### 5. Kleene Star Expression (a*)
Allows zero or more repetitions using epsilon transitions for loops and bypass paths.

### Conversion Pipeline

The complete conversion process implemented in this project follows these stages:

1. **Regular Expression Parsing**: Input regex is validated and converted to postfix notation using the Shunting-yard algorithm
2. **Thompson's Construction**: Postfix expression is converted to ε-NFA using Thompson's rules
3. **Epsilon Removal**: ε-NFA is converted to standard NFA using epsilon-closure computation
4. **Subset Construction**: NFA is converted to DFA using the powerset construction algorithm
5. **DFA Minimization**: DFA is minimized using Hopcroft's algorithm to produce the minimal DFA

---

## What the Website Covers

### Core Features

#### 1. Interactive Visualization
- Real-time graph rendering of automata at each stage
- Step-by-step animation of the construction process
- Adjustable playback speed (0.25x to 3x)
- Manual step-through mode for detailed examination

#### 2. Educational Content
- Comprehensive theory panel explaining automata concepts
- Detailed explanations for each conversion stage
- Thompson's Construction rules visualizer
- Transition tables for each automaton type

#### 3. String Simulation
- Forward simulation: Test if a string is accepted by the automaton
- Reverse simulation: Find paths that lead to acceptance
- Complete trace logs showing state transitions
- Quick test panel for rapid string validation

#### 4. Presentation Mode
- Fullscreen slide-by-slide walkthrough
- Suitable for classroom demonstrations
- Keyboard navigation support
- Professional presentation layout

#### 5. Export Capabilities
- PNG export: High-quality raster images
- SVG export: Scalable vector graphics
- JSON export: Machine-readable automaton data
- ZIP export: Complete bundle of all formats

#### 6. User Interface Features
- Light and dark theme support
- Example library with common regex patterns
- Real-time regex validation
- State statistics display
- Zoom and pan controls
- Fullscreen canvas mode

### Theoretical Concepts Covered

1. **Regular Expressions**: Pattern definition using union, concatenation, Kleene star, and grouping
2. **Epsilon-NFA (ε-NFA)**: Non-deterministic finite automaton with epsilon transitions
3. **Epsilon-Closure**: Set of states reachable via epsilon transitions
4. **NFA (Non-deterministic Finite Automaton)**: Automaton allowing multiple transitions per symbol
5. **DFA (Deterministic Finite Automaton)**: Automaton with exactly one transition per state-symbol pair
6. **Subset Construction**: Algorithm for converting NFA to DFA
7. **DFA Minimization**: Hopcroft's algorithm for reducing DFA to minimal form
8. **State Equivalence**: Concept of indistinguishable states in automata

---

## Directory Structure

```
autocurate/
├── index.html                  # Main application entry point
├── favicon.svg                 # Application icon
├── README.md                   # Project documentation (this file)
├── LICENSE                     # MIT License
├── .gitignore                  # Git ignore configuration
├── PROJECT_STRUCTURE.md        # Detailed structure documentation
├── CLEAN_PROJECT_SUMMARY.md    # Project organization summary
│
├── css/                        # Stylesheet directory (10 files)
│   ├── tokens.css              # Design system tokens and CSS variables
│   ├── reset.css               # CSS reset and base styles
│   ├── layout.css              # Application layout structure
│   ├── components.css          # Reusable UI components
│   ├── graph.css               # Graph canvas and visualization
│   ├── panels.css              # Side panel layouts
│   ├── modal.css               # Modal dialog styles
│   ├── presentation.css        # Presentation mode styles
│   ├── thompson.css            # Thompson visualizer styles
│   └── animations.css          # CSS animations and transitions
│
├── js/                         # JavaScript modules (17 files)
│   ├── app.js                  # Global state and core utilities
│   ├── regex-parser.js         # Shunting-yard algorithm implementation
│   ├── thompson.js             # Thompson's construction algorithm
│   ├── nfa.js                  # Glushkov NFA construction
│   ├── dfa.js                  # Subset construction (NFA to DFA)
│   ├── minimizer.js            # Hopcroft's DFA minimization
│   ├── cytoscape-init.js       # Graph rendering engine setup
│   ├── pipeline.js             # Conversion pipeline orchestration
│   ├── playback.js             # Animation playback controls
│   ├── simulation.js           # String acceptance simulation
│   ├── presentation.js         # Presentation mode logic
│   ├── thompson-visualizer.js  # Thompson rules visualization
│   ├── export.js               # Export functionality (PNG/SVG/JSON/ZIP)
│   ├── theme.js                # Theme switching logic
│   ├── theory.js               # Theory panel content
│   ├── ui.js                   # UI helper functions
│   └── main.js                 # Application initialization
│
└── excess/                     # Non-essential files (optional)
    ├── README.md               # Documentation of excess folder
    ├── index_original.html     # Original monolithic file (backup)
    └── [documentation files]   # Refactoring and verification docs
```

---

## Repository Structure and File Purposes

### HTML Files

#### index.html
Main application file containing the complete HTML structure. This file serves as the entry point and includes:
- Document metadata and external dependencies
- Application layout structure (header, sidebar, main canvas, right panel)
- Modal dialogs for simulation and presentation
- Links to all CSS stylesheets (in cascade order)
- Links to all JavaScript modules (in dependency order)

### CSS Files (Modular Stylesheet Organization)

#### css/tokens.css
Defines the design system foundation including:
- CSS custom properties (variables) for colors
- Typography scale and font families
- Spacing and sizing tokens
- Theme-specific color schemes

#### css/reset.css
Provides browser normalization:
- CSS reset rules
- Base element styling
- Typography defaults
- Scrollbar customization

#### css/layout.css
Defines application structure:
- Top navigation bar layout
- Sidebar positioning and sizing
- Main canvas area layout
- Responsive grid system

#### css/components.css
Styles for reusable UI components:
- Buttons (primary, secondary, icon buttons)
- Input fields and validation states
- Cards and containers
- Toggle switches and controls
- Dropdown menus
- Statistics displays

#### css/graph.css
Graph visualization styles:
- Canvas container styling
- Empty state display
- Floating controls overlay
- Zoom controls
- Legend styling
- Node and edge visual indicators

#### css/panels.css
Side panel layouts:
- Right panel tab navigation
- Content pane styling
- Explanation cards
- Table displays
- Theory accordion

#### css/modal.css
Modal dialog styles:
- Overlay and backdrop
- Modal container and positioning
- Simulation interface
- Trace log display
- Result indicators

#### css/presentation.css
Fullscreen presentation mode:
- Slide layout
- Navigation controls
- Progress indicators
- Presenter view styling

#### css/thompson.css
Thompson visualizer specific styles:
- Rule card layouts
- SVG diagram containers
- Construction step displays

#### css/animations.css
Animation definitions:
- Keyframe animations
- Transition effects
- Loading spinners
- Toast notifications

### JavaScript Files (Modular Code Organization)

#### js/app.js
Global application state and core utilities:
- `App` object: Central state management
- `$()` function: DOM element selector
- `cy` and `prescy`: Cytoscape graph instances
- `smartFit()`: Graph viewport fitting
- `preprocessRegex()`: Regex preprocessing
- Stage navigation functions

#### js/regex-parser.js
Regular expression parsing:
- `preprocessRegex()`: Input normalization
- `insertConcat()`: Explicit concatenation insertion
- `shuntingYard()`: Infix to postfix conversion using Dijkstra's algorithm

#### js/thompson.js
Thompson's Construction implementation:
- `mkState()`: State factory function
- `makeFragment()`: NFA fragment constructor
- `addT()`: Transition addition
- `thompsonBuild()`: Main construction algorithm
- `fragStates()`: Fragment state extraction

#### js/nfa.js
Glushkov NFA construction:
- `buildNFA()`: Alternative NFA construction method
- Position automaton implementation

#### js/dfa.js
Subset construction algorithm:
- `epsClosure()`: Epsilon-closure computation
- `moveOn()`: Move function for state sets
- `alphabet()`: Symbol extraction
- `subsetDFA()`: Powerset construction (NFA to DFA)

#### js/minimizer.js
DFA minimization:
- `minimizeDFA()`: Hopcroft's algorithm implementation
- State equivalence partitioning
- Transition table reconstruction

#### js/cytoscape-init.js
Graph rendering engine:
- `CY_STYLE`: Cytoscape style definitions
- `initCY()`: Graph instance initialization
- `buildElements()`: Node and edge construction
- `renderGraph()`: Graph rendering pipeline
- `runLayout()`: Dagre layout algorithm application

#### js/pipeline.js
Conversion pipeline orchestration:
- `generateAutomaton()`: Main pipeline execution
- `buildPipelineSteps()`: Animation step generation
- `renderPipelineStep()`: Step-by-step rendering
- `updateRegexDisplay()`: Regex information display

#### js/playback.js
Animation control system:
- `setSpeed()`: Playback speed adjustment
- `togglePlay()`: Play/pause control
- `stepFwd()` / `stepBack()`: Manual stepping
- `toggleStepMode()`: Step-by-step mode toggle
- `updateStepCounter()`: Progress display

#### js/simulation.js
String acceptance testing:
- `simulate()`: Forward simulation algorithm
- `reverseSim()`: Reverse path finding
- `setSimMode()`: DFA/MinDFA selection
- `runSim()`: Simulation execution
- `quickTest()`: Rapid string validation

#### js/presentation.js
Presentation mode implementation:
- `buildPresSlides()`: Slide generation
- `openPres()` / `closePres()`: Mode toggling
- `showPresSlide()`: Slide rendering
- `presNav()`: Navigation control

#### js/thompson-visualizer.js
Thompson rules visualization:
- `openThompson()` / `closeThompson()`: Visualizer control
- SVG diagram generation for construction rules

#### js/export.js
Export functionality:
- PNG export: Canvas to raster image
- SVG export: Vector graphics generation
- JSON export: Automaton data serialization
- ZIP export: Multi-format bundle creation

#### js/theme.js
Theme management:
- `cycleTheme()`: Theme switching
- Light/dark/auto mode support
- CSS variable manipulation

#### js/theory.js
Educational content:
- `CONCEPTS`: Theory definitions array
- `buildTheory()`: Theory panel generation
- Accordion interaction handling

#### js/ui.js
User interface utilities:
- `showToast()`: Notification display
- `switchRP()`: Right panel tab switching
- `setBadge()`: Canvas badge updates
- `showCY()` / `hideCY()`: Canvas visibility
- Input validation and formatting

#### js/main.js
Application initialization:
- DOMContentLoaded event handler
- Cytoscape plugin registration
- Initial graph setup
- Event listener attachment
- Startup message display

---

## Technical Implementation

### Technologies Used

**Core Technologies:**
- HTML5: Semantic markup and structure
- CSS3: Modern styling with custom properties
- JavaScript (ES6+): Application logic and algorithms

**External Libraries:**
- Cytoscape.js (v3.28.1): Graph visualization and rendering
- Dagre (v0.8.5): Directed graph layout algorithm
- cytoscape-dagre (v2.5.0): Cytoscape-Dagre integration
- JSZip (v3.10.1): Client-side ZIP file generation

**Fonts:**
- Manrope: Primary UI font
- Inter: Secondary UI and labels
- JetBrains Mono: Monospace for code/regex

### Design Principles

1. **No Build Tools Required**: Pure HTML/CSS/JavaScript implementation
2. **Modular Architecture**: Separation of concerns across 31 files
3. **Progressive Enhancement**: Core functionality works without JavaScript
4. **Responsive Design**: Adapts to different screen sizes
5. **Accessibility**: Semantic HTML and ARIA attributes
6. **Performance**: Efficient algorithms and lazy loading

---

## Installation and Usage

### Prerequisites
- Modern web browser (Chrome, Firefox, Safari, or Edge)
- No server or build tools required

### Running the Application

**Method 1: Direct File Access**
```
1. Download or clone the repository
2. Open index.html in a web browser
```

**Method 2: Local Web Server (Recommended)**
```bash
# Using Node.js
npx serve .

# Using Python 3
python3 -m http.server 8080

# Then navigate to http://localhost:8080
```

### Basic Usage

1. Enter a regular expression in the input field (e.g., `(a|b)*abb`)
2. Click "Generate Automaton" to start the conversion
3. Use the breadcrumb navigation to view different stages
4. Click "Play" to animate the construction process
5. Use the right panel to explore theory, tables, and simulation

---

## Academic References

### Theoretical Foundations

1. **Thompson, K.** (1968). "Programming Techniques: Regular expression search algorithm." *Communications of the ACM*, 11(6), 419-422.

2. **Hopcroft, J. E., & Ullman, J. D.** (1979). *Introduction to Automata Theory, Languages, and Computation*. Addison-Wesley.

3. **Aho, A. V., Sethi, R., & Ullman, J. D.** (1986). *Compilers: Principles, Techniques, and Tools*. Addison-Wesley.

4. **Sipser, M.** (2012). *Introduction to the Theory of Computation* (3rd ed.). Cengage Learning.

### Algorithms Implemented

- **Shunting-yard Algorithm**: Dijkstra, E. W. (1961)
- **Thompson's Construction**: Thompson, K. (1968)
- **Subset Construction**: Rabin & Scott (1959)
- **Hopcroft's Minimization**: Hopcroft, J. E. (1971)

---

## License

This project is licensed under the MIT License. See the LICENSE file for details.

---

## Acknowledgments

This project was developed as an educational tool for Theory of Computation coursework. Special thanks to the course instructors and the open-source community for providing the foundational libraries (Cytoscape.js, Dagre) that made this visualization possible.

---

**Project Status**: Complete and Production-Ready  
**Last Updated**: April 15, 2026  
**Version**: 1.0.0
