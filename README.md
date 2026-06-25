# Java Code Visualizer ☕🔍

A premium, high-contrast, interactive Java code execution visualizer. This tool helps students and developers understand Java execution flows, stack frames, heap space, and array/object states in real-time, complete with an AI-powered tutor.

---

## 🌟 Key Features

### 1. Interactive Java Code Editor
* **Monochromatic Editor**: Clean CodeMirror-based code editor with high-contrast syntax highlighting.
* **Line Highlighting**: Automatically highlights the active line of execution, scrolling it into view.
* **Error Banner**: Shows comprehensive compile-time and runtime exceptions with stack traces.

### 2. Dual-Space Memory Canvas
* **Call Stack**: Displays stack frames dynamically. Active frames stack at the top with depth labels. Values update in real-time.
* **Heap Space**: Displays reference objects and arrays.
* **2D Matrix Auto-Inlining**: Automatically detects and inlines 2D arrays (matrices) as coordinate grid tables within parent objects, highlighting modified cells in blue during assignment changes.

### 3. Execution flow & Interactive Timeline
* **Execution Flow Card**: Displays formulas, substituted values, and outcomes for calculation or condition steps.
* **State Mutation (Diff) Box**: Captures mutations showing the exact change transition (e.g., `value: 1 ➔ 2` or `NEW ➔ 0`) with dynamic variable name resolution.
* **Execution Timeline**: Vertical scrollable log of all execution history steps. You can click any step in the log to instantly jump to that point in execution history.

### 4. Interactive Expression Evaluator (REPL)
* **Live Sandbox**: A terminal input at the bottom of the console that lets you type any arbitrary Java expression (e.g., `nums[mid]`, `low + (high - low) / 2`, or `low < high`) to evaluate it against the active stack variables and view the result instantly.

### 5. AI Tutor & Code Summarizer (Groq Cloud API)
* **AI Code Summary**: Provides a high-level summary, difficulty rating (Beginner/Intermediate/Advanced), and concept tags (e.g., `recursion`, `binary search`).
* **AI Tutor Narrator**: Explains compiler actions in plain English (jargon-free, 5th-grade reading level) under the active step details card.

### 6. Playback Controls
* Full debugger controls: Step forward, step backward, auto-play/pause, reset, jump to start/end, and adjust execution delay (200ms to 2000ms).

---

## 🛠️ How to Use

### 1. Run the Code
1. Edit the Java code in the **Code Editor** or leave the default test code.
2. Click **Visualize** in the editor header to compile and analyze the code.

### 2. Step Through Execution
1. Use the **Playback Controls** in the footer bar to navigate.
2. Observe the active line highlighted in the Code Editor.
3. Track variables and references changing inside the **Call Stack**, **Variable Watch**, and **Heap Space** panels.

### 3. Evaluate Expressions
1. At any execution step, type a Java expression in the console input labeled `expr $` (e.g., `sum + i` or `nums[i]`) and press **Enter**.
2. The evaluated result will print in the console logs.

---

## 🚀 Setup & Local Installation

### Prerequisites
* [Node.js](https://nodejs.org/) (v18 or higher recommended)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory and add your Groq API key:
```env
VITE_GROQ_API_KEY=your_groq_api_key_here
```

### 3. Start the Development Server
```bash
npm run dev
```
Open `http://localhost:5173/` in your browser.

---

## ☁️ Deployment

### Deploys to Vercel
1. Push your repository to **GitHub**.
2. Connect your GitHub account to [Vercel](https://vercel.com).
3. Import the repository.
4. Under **Settings -> Environment Variables**, add:
   * **Key**: `VITE_GROQ_API_KEY`
   * **Value**: `your_groq_api_key_here`
5. Click **Deploy**.

deployed link = https://java-visualizer-amber.vercel.app/
