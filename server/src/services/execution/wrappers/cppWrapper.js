import { getAdapter } from '../adapters/adapterRegistry.js';
import { extractCppFunctionInfo } from './cppParser.js';

export const buildCppWrapper = ({
  code,
  functionName = 'solution',
  parameters = [],
  dataStructure = 'ARRAY',
  returnType = 'void'
}) => {
  const isLinkedList =
    dataStructure === 'LINKED_LIST' ||
    (returnType && /List[nN]ode/i.test(returnType)) ||
    (code && /List[nN]ode/i.test(code)) ||
    (parameters && parameters.some((p) => /List[nN]ode/i.test(p.type || '')));

  const isBinaryTree =
    dataStructure === 'BINARY_TREE' ||
    (returnType && /Tree[nN]ode/i.test(returnType)) ||
    (code && /Tree[nN]ode/i.test(code)) ||
    (parameters && parameters.some((p) => /Tree[nN]ode/i.test(p.type || '')));

  let typeDefs = '';
  if (isLinkedList || /\bList[nN]ode\b/i.test(code)) {
    typeDefs += getAdapter('LINKED_LIST').getTypeDeclarations('cpp', { code }) + '\n';
  }
  if (isBinaryTree || /\bTree[nN]ode\b/i.test(code)) {
    typeDefs += getAdapter('BINARY_TREE').getTypeDeclarations('cpp', { code }) + '\n';
  }
  if (!isLinkedList && !isBinaryTree && dataStructure && dataStructure !== 'ARRAY') {
    typeDefs += getAdapter(dataStructure).getTypeDeclarations('cpp', { code }) + '\n';
  }

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

  let invocationCode = '';
  if (activeParams.length > 0) {
    const decls = activeParams.map((p, i) => {
      const rawExpr = `(input_lines.size() > ${i} ? input_lines[${i}] : (tokens.size() > ${i} ? tokens[${i}] : full_input))`;
      const pType = (p.type || '').replace(/\s+/g, ' ').trim();
      const pName = p.name || `arg${i}`;

      if (/Tree[nN]ode/i.test(pType) || (isBinaryTree && !/List[nN]ode/i.test(pType))) {
        return `TreeNode* ${pName} = parseTreeNodeArg(${rawExpr});`;
      }
      if (/List[nN]ode/i.test(pType) || (isLinkedList && !/Tree[nN]ode/i.test(pType))) {
        return `ListNode* ${pName} = parseListNodeArg(${rawExpr});`;
      }
      if (pType.includes('vector<int>') || pType.includes('std::vector<int>')) {
        return `vector<int> ${pName} = parseVectorInt(${rawExpr});`;
      }
      if (pType.includes('long long') || pType.includes('int64_t')) {
        return `long long ${pName} = parseLongArg(${rawExpr});`;
      }
      if (pType.includes('double') || pType.includes('float')) {
        return `double ${pName} = parseDoubleArg(${rawExpr});`;
      }
      if (pType.includes('bool')) {
        return `bool ${pName} = parseBoolArg(${rawExpr});`;
      }
      if (pType.includes('string')) {
        return `string ${pName} = parseStringArg(${rawExpr});`;
      }
      return `int ${pName} = parseIntArg(${rawExpr});`;
    }).join('\n        ');

    const callArgs = activeParams.map((p, i) => p.name || `arg${i}`).join(', ');
    invocationCode = `
        ${decls}
        Solution sol;
        auto res = sol.${targetFn}(${callArgs});
        printOutput(res);
`;
  } else {
    // Dynamic adaptive fallback
    invocationCode = `
        Solution sol;
        if (full_input.find('[') != string::npos) {
            ${isBinaryTree ? `
            TreeNode* root = parseTreeNodeArg(full_input);
            auto res = sol.${targetFn}(root);
            printOutput(res);
            ` : isLinkedList ? `
            ListNode* head = parseListNodeArg(full_input);
            auto res = sol.${targetFn}(head);
            printOutput(res);
            ` : `
            auto res = sol.${targetFn}(parseVectorInt(full_input));
            printOutput(res);
            `}
        } else {
            int a = tokens.size() > 0 ? parseIntArg(tokens[0]) : 0;
            int b = tokens.size() > 1 ? parseIntArg(tokens[1]) : 0;
            auto res = sol.${targetFn}(a, b);
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
${isLinkedList ? `
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
${isBinaryTree ? `
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

${isLinkedList ? `
ListNode* parseListNodeArg(const string& raw) {
    return ListNode::fromVec(parseVectorInt(raw));
}
` : ''}

${isBinaryTree ? `
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
