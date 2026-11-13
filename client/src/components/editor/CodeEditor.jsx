import React, { useRef, useCallback, memo } from 'react';
import Editor from '@monaco-editor/react';

// Map diverse language tokens to Monaco language IDs
const normalizeMonacoLanguage = (lang = 'javascript') => {
  const l = String(lang).toLowerCase().trim();
  if (l === 'py' || l === 'python') return 'python';
  if (l === 'js' || l === 'javascript' || l === 'node') return 'javascript';
  if (l === 'java') return 'java';
  if (l === 'cpp' || l === 'c++' || l === 'c') return 'cpp';
  return 'javascript';
};

export const CodeEditor = memo(({
  value = '',
  onChange,
  language = 'javascript',
  theme = 'vs-dark', // 'vs-dark' | 'light'
  height = '100%',
  width = '100%',
  readOnly = false,
  fontSize = 13,
  minimap = false,
  tabSize,
  placeholder = '// Write your code here...',
  onMount,
  className = ''
}) => {
  const editorRef = useRef(null);
  const monacoLanguage = normalizeMonacoLanguage(language);
  const effectiveTabSize = tabSize !== undefined ? tabSize : (monacoLanguage === 'python' ? 4 : 2);

  const handleEditorDidMount = useCallback((editor, monaco) => {
    editorRef.current = editor;

    // Define subtle TestForge dark theme matching design system
    monaco.editor.defineTheme('testforge-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6B7280', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'EDFF72', fontStyle: 'bold' },
        { token: 'string', foreground: 'A3E635' },
        { token: 'number', foreground: '38BDF8' },
        { token: 'type', foreground: 'F472B6' },
        { token: 'identifier', foreground: 'E2E8F0' }
      ],
      colors: {
        'editor.background': '#131416',
        'editor.foreground': '#EDEDED',
        'editorCursor.foreground': '#EDFF72',
        'editor.lineHighlightBackground': '#1B1C20',
        'editorLineNumber.foreground': '#4B5563',
        'editorLineNumber.activeForeground': '#EDFF72',
        'editor.selectionBackground': '#2A3441',
        'editor.inactiveSelectionBackground': '#1E2530',
        'editorBracketMatch.background': '#2C3E50',
        'editorBracketMatch.border': '#EDFF72'
      }
    });

    // Define crisp TestForge light theme
    monaco.editor.defineTheme('testforge-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6B7280', fontStyle: 'italic' },
        { token: 'keyword', foreground: '0284C7', fontStyle: 'bold' },
        { token: 'string', foreground: '15803D' },
        { token: 'number', foreground: 'B45309' },
        { token: 'identifier', foreground: '171819' }
      ],
      colors: {
        'editor.background': '#FFFFFF',
        'editor.foreground': '#171819',
        'editorCursor.foreground': '#0F172A',
        'editor.lineHighlightBackground': '#F8FAFC',
        'editorLineNumber.foreground': '#94A3B8',
        'editorLineNumber.activeForeground': '#0F172A',
        'editor.selectionBackground': '#E2E8F0'
      }
    });

    if (onMount) {
      onMount(editor, monaco);
    }
  }, [onMount]);

  const editorTheme = theme === 'vs-dark' || theme === 'dark' ? 'testforge-dark' : 'testforge-light';

  return (
    <div className={`relative w-full h-full min-h-[140px] overflow-hidden ${className}`}>
      <Editor
        height={height}
        width={width}
        language={monacoLanguage}
        theme={editorTheme}
        value={value}
        onChange={onChange}
        onMount={handleEditorDidMount}
        loading={
          <div className="flex items-center justify-center h-full w-full bg-[#131416] text-[#777D78] text-xs font-mono gap-2">
            <span className="w-2.5 h-2.5 rounded-full border-2 border-[#EDFF72] border-t-transparent animate-spin" />
            <span>Initializing Monaco Engine...</span>
          </div>
        }
        options={{
          readOnly,
          fontSize,
          lineHeight: 21,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, Menlo, monospace",
          fontLigatures: true,
          tabSize: effectiveTabSize,
          insertSpaces: true,
          minimap: { enabled: minimap },
          lineNumbers: 'on',
          lineNumbersMinChars: 3,
          glyphMargin: false,
          folding: true,
          automaticLayout: true,
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          bracketPairColorization: { enabled: true },
          autoClosingBrackets: 'always',
          autoClosingQuotes: 'always',
          autoIndent: 'full',
          formatOnPaste: false,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          smoothScrolling: true,
          renderWhitespace: 'none',
          contextmenu: true,
          scrollbar: {
            vertical: 'visible',
            horizontal: 'auto',
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
            useShadows: false
          }
        }}
      />
    </div>
  );
});

CodeEditor.displayName = 'CodeEditor';

export default CodeEditor;
