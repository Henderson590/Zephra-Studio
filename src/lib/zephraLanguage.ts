import type { languages } from "monaco-editor";

export const zephraLanguageId = "zephra";

export function registerZephraLanguage(monaco: any) {
  monaco.languages.register({ id: zephraLanguageId });

  monaco.languages.setMonarchTokensProvider(zephraLanguageId, {
    defaultToken: "",
    tokenPostfix: ".zephra",

    keywords: [
      "let",
      "const",
      "if",
      "else",
      "fn",
      "func",
      "function",
      "for",
      "while",
      "function",
      "return",
      "break",
      "continue",
      "true",
      "false",
      "null",
      "import",
      "from",
      "as",
      "export",
      "class",
      "extends",
      "new",
      "try",
      "catch",
      "finally",
      "throw",
      "await",
      "async",
      "in",
      "of",
      "switch",
      "case",
      "default"
    ],

    typeKeywords: ["int", "float", "string", "bool", "void"],

    builtins: [
      "print",
      "input",
      "len",
      "read_file",
      "write_file",
      "append_file",
      "studio_command",
      "sin",
      "cos",
      "tan",
      "sqrt",
      "pow",
      "pi",
      "cwd",
      "listdir",
      "json_load",
      "json_dump",
      "type_of"
    ],

    operators: [
      "=", "+", "-", "*", "/", "%", "+=" , "-=" , "*=" , "/=", "%=", "==", "!=", "<", ">", "<=", ">=", "&&", "||", "!", "~", "^", "<<", ">>"
    ],

    symbols: /[=><!~?:&|+\-*\/\^%]+/,

    tokenizer: {
      root: [
        // identifiers and keywords
        [/[a-zA-Z_][\w]*/, {
          cases: {
            "@keywords": "keyword",
            "@typeKeywords": "type",
            "@builtins": "predefined",
            "true|false|null": "keyword",
            "@default": "identifier"
          }
        }],

        // whitespace
        { include: "whitespace" },

        // delimiters and operators
        [/[{}()[\]]/, "delimiter"],
        [/[,.]/, "delimiter"],
        [/@symbols/, {
          cases: {
            "@operators": "operator",
            "@default": "" 
          }
        }],

        // numbers
        [/(\d*\.)?\d+([eE][\-+]?\d+)?/, "number"],

        // strings
        [/'([^'\\]|\\.)*$/, "string.invalid"],
        [/'/, { token: "string.quote", next: "string" }],
        [/"([^"\\]|\\.)*$/, "string.invalid"],
        [/"/, { token: "string.quote", next: "string" }]
      ],

      whitespace: [
        [/[ \t\r\n]+/, ""],
        [/\/\/.*$/, "comment"],
        [/\/\*/, "comment", "comment"]
      ],

      comment: [
        [/[\/*]/, "comment"],
        [/[\*]\//, "comment", "@pop"],
        [/[^\/*]+/, "comment"]
      ],

      string: [
        [/[^\\"]+/, "string"],
        [/\\./, "string.escape"],
        [/"/, { token: "string.quote", next: "@pop" }],
        [/'/, { token: "string.quote", next: "@pop" }]
      ]
    }
  });

  monaco.languages.setLanguageConfiguration(zephraLanguageId, {
    comments: {
      lineComment: "//",
      blockComment: ["/*", "*/"]
    },
    brackets: [["{", "}"], ["[", "]"], ["(", ")"]],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: "\"", close: "\"" },
      { open: "'", close: "'" }
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: "\"", close: "\"" },
      { open: "'", close: "'" }
    ],
    folding: {
      markers: {
        start: /^\s*\/\*\s*#?region\b/, // region markers
        end: /^\s*\/\*\s*#?endregion\b/
      }
    }
  });
}

export function detectLanguageFromPath(filePath: string) {
  if (!filePath) return "plaintext";
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "zph":
    case "zephra":
      return zephraLanguageId;
    case "js":
    case "jsx":
      return "javascript";
    case "ts":
    case "tsx":
      return "typescript";
    case "py":
      return "python";
    case "cpp":
    case "cc":
    case "c":
    case "h":
    case "hpp":
      return "cpp";
    case "html":
      return "html";
    case "css":
      return "css";
    case "json":
      return "json";
    case "md":
      return "markdown";
    default:
      return "plaintext";
  }
}

export function getDefaultFileName() {
  return "untitled.zph";
}
