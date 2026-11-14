import { getAdapter } from '../adapters/adapterRegistry.js';
import { extractCppFunctionInfo } from './cppParser.js';

export const buildCppWrapper = ({
  code,
  functionName = 'solution',
  parameters = [],
  dataStructure = 'ARRAY',
  returnType = 'void'
}) => {
  // Strict metadata precedence: explicit metadata is authoritative.
  // When dataStructure is explicitly ARRAY or NONE, do not allow source heuristics to override it.
  const explicitDS = dataStructure && dataStructure !== 'NONE' && dataStructure !== 'ARRAY';
  const isLinkedList =
    dataStructure === 'LINKED_LIST' ||
    (!explicitDS && (
      (returnType && /List[nN]ode/i.test(returnType)) ||
      (parameters && parameters.some((p) => /List[nN]ode/i.test(p.type || '')))
    ));

  const isBinaryTree =
    dataStructure === 'BINARY_TREE' ||
    (!explicitDS && (
      (returnType && /Tree[nN]ode/i.test(returnType)) ||
      (parameters && parameters.some((p) => /Tree[nN]ode/i.test(p.type || '')))
    ));

  // Normalize code for case variations (Treenode/Listnode)
  const normalizedCode = code
    .replace(/\bListnode\b/g, 'ListNode')
    .replace(/\bTreenode\b/g, 'TreeNode');

  // Dynamically resolve target function name and parameters
  const fnInfo = extractCppFunctionInfo(normalizedCode);
  const targetFn = (functionName && functionName !== 'solution')
    ? functionName
    : (fnInfo?.funcName || functionName || 'solution');

  const activeParams = (parameters && parameters.length > 0)
    ? parameters
    : (fnInfo?.params || []);

  const needsListNode = isLinkedList || /\bList[nN]ode\b/i.test(normalizedCode) || activeParams.some((p) => /List[nN]ode/i.test(p.type || ''));
  const needsTreeNode = isBinaryTree || /\bTree[nN]ode\b/i.test(normalizedCode) || activeParams.some((p) => /Tree[nN]ode/i.test(p.type || ''));

  let typeDefs = '';
  if (needsListNode) {
    typeDefs += getAdapter('LINKED_LIST').getTypeDeclarations('cpp', { code: normalizedCode }) + '\n';
  }
  if (needsTreeNode) {
    typeDefs += getAdapter('BINARY_TREE').getTypeDeclarations('cpp', { code: normalizedCode }) + '\n';
  }
  if (!isLinkedList && !isBinaryTree && dataStructure && dataStructure !== 'ARRAY' && dataStructure !== 'NONE') {
    typeDefs += getAdapter(dataStructure).getTypeDeclarations('cpp', { code: normalizedCode }) + '\n';
  }

  const hasSolutionClass = /\b(?:class|struct)\s+Solution\b/.test(normalizedCode);

  let invocationCode = '';
  if (activeParams.length > 0) {
    const decls = activeParams.map((p, i) => {
      const rawExpr = `(smart_args.size() > ${i} ? smart_args[${i}] : (input_lines.size() > ${i} ? input_lines[${i}] : (${activeParams.length === 1 ? 'full_input' : 'string("")'})))`;
      const pType = (p.type || '').replace(/\s+/g, ' ').trim();
      const pName = p.name || `arg${i}`;

      const missingCheck = activeParams.length > 1
        ? `if (smart_args.size() <= ${i} && input_lines.size() <= ${i}) throw runtime_error("Missing argument for parameter #${i + 1} (${pName})");\n        `
        : '';

      // Parameter-aware conversion: strict check on parameter's declared type
      if (/Tree[nN]ode/i.test(pType)) {
        return `${missingCheck}TreeNode* ${pName} = parseTreeNodeArg(${rawExpr});`;
      }
      if (/List[nN]ode/i.test(pType)) {
        return `${missingCheck}ListNode* ${pName} = parseListNodeArg(${rawExpr});`;
      }
      if (/(?:vector\s*<\s*vector|int\[\]\[\])/i.test(pType)) {
        return `${missingCheck}vector<vector<int>> ${pName} = parseVectorVectorInt(${rawExpr});`;
      }
      if (/(?:vector\s*<\s*string|string\[\])/i.test(pType)) {
        return `${missingCheck}vector<string> ${pName} = parseVectorString(${rawExpr});`;
      }
      if (/(?:vector\s*<\s*int|int\[\])/i.test(pType)) {
        return `${missingCheck}vector<int> ${pName} = parseVectorInt(${rawExpr});`;
      }
      if (pType.includes('long long') || pType.includes('int64_t')) {
        return `${missingCheck}long long ${pName} = parseLongArg(${rawExpr});`;
      }
      if (pType.includes('double') || pType.includes('float')) {
        return `${missingCheck}double ${pName} = parseDoubleArg(${rawExpr});`;
      }
      if (pType.includes('bool')) {
        return `${missingCheck}bool ${pName} = parseBoolArg(${rawExpr});`;
      }
      if (pType.includes('string')) {
        return `${missingCheck}string ${pName} = parseStringArg(${rawExpr});`;
      }

      // Default by dataStructure ONLY for primary parameter (i === 0) if type is generic or missing
      if (i === 0 && isBinaryTree && !/vector|int\[\]/i.test(pType)) {
        return `${missingCheck}TreeNode* ${pName} = parseTreeNodeArg(${rawExpr});`;
      }
      if (i === 0 && isLinkedList && !/vector|int\[\]/i.test(pType)) {
        return `${missingCheck}ListNode* ${pName} = parseListNodeArg(${rawExpr});`;
      }

      return `${missingCheck}int ${pName} = parseIntArg(${rawExpr});`;
    }).join('\n        ');

    const callArgs = activeParams.map((p, i) => p.name || `arg${i}`).join(', ');
    invocationCode = `
        vector<string> smart_args = splitSmartArgs(full_input);
        ${decls}
        ${hasSolutionClass ? `Solution sol;\n        auto res = sol.${targetFn}(${callArgs});` : `auto res = ${targetFn}(${callArgs});`}
        printOutput(res);
`;
  } else {
    // Dynamic adaptive fallback
    invocationCode = `
        ${hasSolutionClass ? 'Solution sol;' : ''}
        if (full_input.find('[') != string::npos) {
            ${isBinaryTree ? `
            TreeNode* root = parseTreeNodeArg(full_input);
            auto res = ${hasSolutionClass ? 'sol.' : ''}${targetFn}(root);
            printOutput(res);
            ` : isLinkedList ? `
            ListNode* head = parseListNodeArg(full_input);
            auto res = ${hasSolutionClass ? 'sol.' : ''}${targetFn}(head);
            printOutput(res);
            ` : `
            auto res = ${hasSolutionClass ? 'sol.' : ''}${targetFn}(parseVectorInt(full_input));
            printOutput(res);
            `}
        } else {
            int a = tokens.size() > 0 ? parseIntArg(tokens[0]) : 0;
            int b = tokens.size() > 1 ? parseIntArg(tokens[1]) : 0;
            auto res = ${hasSolutionClass ? 'sol.' : ''}${targetFn}(a, b);
            printOutput(res);
        }
`;
  }

  return `#include <bits/stdc++.h>
using namespace std;

${typeDefs}

// Result printers
void printOutput(int v)           { cout << v << "\\n"; }
void printOutput(long long v)     { cout << v << "\\n"; }
void printOutput(double v)        { cout << fixed << setprecision(6) << v << "\\n"; }
void printOutput(float v)         { cout << fixed << setprecision(6) << v << "\\n"; }
void printOutput(bool v)          { cout << (v ? "true" : "false") << "\\n"; }
void printOutput(char v)          { cout << "\\\"" << v << "\\\"\\n"; }
void printOutput(const string& v) { cout << v << "\\n"; }
void printOutput(const char* v)   { cout << v << "\\n"; }
void printOutput(const vector<int>& v) {
    cout << "[";
    for (size_t i = 0; i < v.size(); i++) {
        if (i) cout << ",";
        cout << v[i];
    }
    cout << "]\\n";
}
void printOutput(const vector<long long>& v) {
    cout << "[";
    for (size_t i = 0; i < v.size(); i++) {
        if (i) cout << ",";
        cout << v[i];
    }
    cout << "]\\n";
}
void printOutput(const vector<string>& v) {
    cout << "[";
    for (size_t i = 0; i < v.size(); i++) {
        if (i) cout << ",";
        cout << "\\\"" << v[i] << "\\\"";
    }
    cout << "]\\n";
}
void printOutput(const vector<vector<int>>& v) {
    cout << "[";
    for (size_t i = 0; i < v.size(); i++) {
        if (i) cout << ",";
        cout << "[";
        for (size_t j = 0; j < v[i].size(); j++) {
            if (j) cout << ",";
            cout << v[i][j];
        }
        cout << "]";
    }
    cout << "]\\n";
}
${needsListNode ? `
void printOutput(ListNode* v) {
    if (!v) {
        cout << "[]\\n";
        return;
    }
    vector<int> vec = ListNode::toVec(v);
    cout << "[";
    for (size_t i = 0; i < vec.size(); i++) {
        if (i) cout << ",";
        cout << vec[i];
    }
    cout << "]\\n";
}
` : ''}
${needsTreeNode ? `
void printOutput(TreeNode* v) {
    if (!v) {
        cout << "[]\\n";
        return;
    }
    vector<string> vec = TreeNode::toVec(v);
    cout << "[";
    for (size_t i = 0; i < vec.size(); i++) {
        if (i) cout << ",";
        cout << vec[i];
    }
    cout << "]\\n";
}
` : ''}

// Input parsing helpers
// Smart argument splitter matching nested brackets, quotes and newlines
vector<string> splitSmartArgs(const string& input) {
    vector<string> list;
    if (input.empty()) return list;
    string current = "";
    int bracketDepth = 0;
    int braceDepth = 0;
    bool inQuotes = false;
    char quoteChar = 0;
    for (size_t i = 0; i < input.size(); i++) {
        char c = input[i];
        if (inQuotes) {
            current += c;
            if (c == quoteChar && (i == 0 || input[i - 1] != 92)) {
                inQuotes = false;
            }
        } else {
            if (c == '"' || c == 39) {
                inQuotes = true;
                quoteChar = c;
                current += c;
            } else if (c == '[') {
                bracketDepth++;
                current += c;
            } else if (c == ']') {
                if (bracketDepth > 0) bracketDepth--;
                current += c;
            } else if (c == '{') {
                braceDepth++;
                current += c;
            } else if (c == '}') {
                if (braceDepth > 0) braceDepth--;
                current += c;
            } else if (bracketDepth == 0 && braceDepth == 0 && (c == ',' || c == '\\n')) {
                while (!current.empty() && isspace(current.front())) current.erase(current.begin());
                while (!current.empty() && isspace(current.back())) current.pop_back();
                if (!current.empty() && current != "=") {
                    if (current.back() == '=') {
                        current.pop_back();
                        while (!current.empty() && isspace(current.back())) current.pop_back();
                    }
                    if (!current.empty()) list.push_back(current);
                }
                current = "";
            } else {
                current += c;
            }
        }
    }
    while (!current.empty() && isspace(current.front())) current.erase(current.begin());
    while (!current.empty() && isspace(current.back())) current.pop_back();
    if (!current.empty() && current != "=") {
        if (current.back() == '=') {
            current.pop_back();
            while (!current.empty() && isspace(current.back())) current.pop_back();
        }
        if (!current.empty()) list.push_back(current);
    }
    return list;
}

vector<int> parseVectorInt(const string& raw) {
    vector<int> res;
    string s = raw;
    size_t eq = s.find('=');
    if (eq != string::npos) s = s.substr(eq + 1);
    size_t start = s.find('[');
    size_t end = s.rfind(']');
    if (start != string::npos && end != string::npos && end > start) {
        string inner = s.substr(start + 1, end - start - 1);
        stringstream ss(inner);
        string item;
        while (getline(ss, item, ',')) {
            stringstream is(item);
            int val;
            if (is >> val) res.push_back(val);
        }
        return res;
    }
    stringstream ss(s);
    string token;
    while (ss >> token) {
        try {
            string clean = "";
            for (char c : token) if (isdigit(c) || c == '-') clean += c;
            if (!clean.empty() && clean != "-") res.push_back(stoi(clean));
        } catch (...) {}
    }
    return res;
}

vector<vector<int>> parseVectorVectorInt(const string& raw) {
    vector<vector<int>> res;
    string s = raw;
    size_t eq = s.find('=');
    if (eq != string::npos) s = s.substr(eq + 1);
    size_t start = s.find('[');
    size_t end = s.rfind(']');
    if (start != string::npos && end != string::npos && end > start) {
        string inner = s.substr(start + 1, end - start - 1);
        string cur = "";
        int depth = 0;
        for (char c : inner) {
            if (c == '[') {
                depth++;
                cur += c;
            } else if (c == ']') {
                depth--;
                cur += c;
                if (depth == 0) {
                    res.push_back(parseVectorInt(cur));
                    cur = "";
                }
            } else if (depth > 0) {
                cur += c;
            }
        }
    }
    return res;
}

vector<string> parseVectorString(const string& raw) {
    vector<string> res;
    string s = raw;
    size_t eq = s.find('=');
    if (eq != string::npos) s = s.substr(eq + 1);
    size_t start = s.find('[');
    size_t end = s.rfind(']');
    if (start != string::npos && end != string::npos && end > start) {
        string inner = s.substr(start + 1, end - start - 1);
        stringstream ss(inner);
        string item;
        while (getline(ss, item, ',')) {
            while (!item.empty() && isspace(item.front())) item.erase(item.begin());
            while (!item.empty() && isspace(item.back())) item.pop_back();
            if (item.size() >= 2 && item.front() == '"' && item.back() == '"') {
                item = item.substr(1, item.size() - 2);
            }
            if (!item.empty()) res.push_back(item);
        }
    }
    return res;
}

${needsListNode ? `
ListNode* parseListNodeArg(const string& raw) {
    return ListNode::fromVec(parseVectorInt(raw));
}
` : ''}

${needsTreeNode ? `
TreeNode* parseTreeNodeArg(const string& raw) {
    string s = raw;
    size_t eq = s.find('=');
    if (eq != string::npos) s = s.substr(eq + 1);
    size_t start = s.find('[');
    size_t end = s.rfind(']');
    vector<string> items;
    if (start != string::npos && end != string::npos && end > start) {
        string inner = s.substr(start + 1, end - start - 1);
        stringstream ss(inner);
        string item;
        while (getline(ss, item, ',')) {
            while (!item.empty() && isspace(item.front())) item.erase(item.begin());
            while (!item.empty() && isspace(item.back())) item.pop_back();
            if (!item.empty()) items.push_back(item);
        }
    }
    return TreeNode::fromVec(items);
}
` : ''}

int parseIntArg(const string& raw) {
    string s = raw;
    size_t eq = s.find('=');
    if (eq != string::npos) s = s.substr(eq + 1);
    string clean = "";
    for (char c : s) if (isdigit(c) || c == '-') clean += c;
    return (clean.empty() || clean == "-") ? 0 : stoi(clean);
}

long long parseLongArg(const string& raw) {
    string s = raw;
    size_t eq = s.find('=');
    if (eq != string::npos) s = s.substr(eq + 1);
    string clean = "";
    for (char c : s) if (isdigit(c) || c == '-') clean += c;
    return (clean.empty() || clean == "-") ? 0LL : stoll(clean);
}

double parseDoubleArg(const string& raw) {
    string s = raw;
    size_t eq = s.find('=');
    if (eq != string::npos) s = s.substr(eq + 1);
    try { return stod(s); } catch(...) { return 0.0; }
}

bool parseBoolArg(const string& raw) {
    string s = raw;
    size_t eq = s.find('=');
    if (eq != string::npos) s = s.substr(eq + 1);
    while (!s.empty() && isspace(s.front())) s.erase(s.begin());
    while (!s.empty() && isspace(s.back())) s.pop_back();
    return (s == "true" || s == "1" || s == "True");
}

string parseStringArg(const string& raw) {
    string s = raw;
    size_t eq = s.find('=');
    if (eq != string::npos) s = s.substr(eq + 1);
    while (!s.empty() && isspace(s.front())) s.erase(s.begin());
    while (!s.empty() && isspace(s.back())) s.pop_back();
    if (s.size() >= 2 && s.front() == '"' && s.back() == '"') {
        s = s.substr(1, s.size() - 2);
    }
    return s;
}

${normalizedCode}

int main() {
    try {
        vector<string> input_lines;
        string l;
        while (getline(cin, l)) {
            while (!l.empty() && (l.back() == '\\r' || l.back() == ' ')) l.pop_back();
            if (!l.empty()) input_lines.push_back(l);
        }
        string full_input = "";
        for (size_t i = 0; i < input_lines.size(); i++) {
            if (i > 0) full_input += "\\n";
            full_input += input_lines[i];
        }

        vector<string> tokens;
        stringstream tss(full_input);
        string tok;
        while (tss >> tok) {
            tokens.push_back(tok);
        }

        ${invocationCode}
        return 0;
    } catch (const std::exception& e) {
        cerr << e.what() << endl;
        return 1;
    } catch (...) {
        cerr << "Execution exception" << endl;
        return 1;
    }
}
`;
};

export default buildCppWrapper;
