import { BaseAdapter } from './BaseAdapter.js';

export const MAX_TREE_NODES = 100000;

/**
 * BinaryTreeAdapter
 * Specializes in Binary Trees (TreeNode) represented in level-order arrays.
 * Handles empty trees, single nodes, null children, and unbalanced trees
 * with cycle detection and a 100,000 node safety limit across C++, Java, Python, and JavaScript.
 */
export class BinaryTreeAdapter extends BaseAdapter {
  constructor() {
    super('BINARY_TREE');
  }

  /**
   * Returns language-specific TreeNode declarations if not already in code.
   */
  getTypeDeclarations(language, options = {}) {
    const { code = '' } = options;

    if (language === 'cpp' || language === 'c++') {
      const hasUserTreeNode = /\b(?:struct|class)\s+Tree[nN]ode\b/.test(code);
      if (hasUserTreeNode) return 'using Treenode = TreeNode;\n';
      return `
// Definition for a binary tree node.
struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
    TreeNode() : val(0), left(nullptr), right(nullptr) {}
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
    TreeNode(int x, TreeNode *left, TreeNode *right) : val(x), left(left), right(right) {}

    static TreeNode* fromVec(const vector<string>& v) {
        if (v.empty()) return nullptr;
        string first = v[0];
        while (!first.empty() && isspace(first.front())) first.erase(first.begin());
        while (!first.empty() && isspace(first.back())) first.pop_back();
        if (first == "null" || first == "nil" || first == "None" || first.empty()) return nullptr;

        TreeNode* root = new TreeNode(stoi(first));
        queue<TreeNode*> q;
        q.push(root);
        size_t i = 1;
        while (!q.empty() && i < v.size()) {
            TreeNode* curr = q.front();
            q.pop();

            if (i < v.size()) {
                string item = v[i];
                while (!item.empty() && isspace(item.front())) item.erase(item.begin());
                while (!item.empty() && isspace(item.back())) item.pop_back();
                if (item != "null" && item != "nil" && item != "None" && !item.empty()) {
                    curr->left = new TreeNode(stoi(item));
                    q.push(curr->left);
                }
                i++;
            }

            if (i < v.size()) {
                string item = v[i];
                while (!item.empty() && isspace(item.front())) item.erase(item.begin());
                while (!item.empty() && isspace(item.back())) item.pop_back();
                if (item != "null" && item != "nil" && item != "None" && !item.empty()) {
                    curr->right = new TreeNode(stoi(item));
                    q.push(curr->right);
                }
                i++;
            }
        }
        return root;
    }

    static vector<string> toVec(TreeNode* root, int limit = ${MAX_TREE_NODES}) {
        vector<string> res;
        if (!root) return res;
        queue<TreeNode*> q;
        q.push(root);
        int visited = 0;
        while (!q.empty()) {
            TreeNode* curr = q.front();
            q.pop();
            if (curr) {
                if (++visited > limit) {
                    throw runtime_error("Cycle detected or binary tree node limit exceeded (max 100,000 nodes)");
                }
                res.push_back(to_string(curr->val));
                q.push(curr->left);
                q.push(curr->right);
            } else {
                res.push_back("null");
            }
        }
        while (!res.empty() && res.back() == "null") {
            res.pop_back();
        }
        return res;
    }
};
using Treenode = TreeNode;
`;
    }

    if (language === 'java') {
      const hasUserTreeNode = /\bclass\s+Tree[nN]ode\b/.test(code);
      if (hasUserTreeNode) {
        return `
class Treenode extends TreeNode {
    public Treenode() { super(); }
    public Treenode(int val) { super(val); }
    public Treenode(int val, TreeNode left, TreeNode right) { super(val, left, right); }
}
`;
      }
      return `
class TreeNode {
    public int val;
    public TreeNode left;
    public TreeNode right;
    public TreeNode() {}
    public TreeNode(int val) { this.val = val; }
    public TreeNode(int val, TreeNode left, TreeNode right) {
        this.val = val;
        this.left = left;
        this.right = right;
    }

    public static TreeNode fromLevelOrder(Integer[] vals) {
        if (vals == null || vals.length == 0 || vals[0] == null) return null;
        TreeNode root = new TreeNode(vals[0]);
        Queue<TreeNode> queue = new LinkedList<>();
        queue.offer(root);
        int i = 1;
        while (!queue.isEmpty() && i < vals.length) {
            TreeNode node = queue.poll();
            if (i < vals.length && vals[i] != null) {
                node.left = new TreeNode(vals[i]);
                queue.offer(node.left);
            }
            i++;
            if (i < vals.length && vals[i] != null) {
                node.right = new TreeNode(vals[i]);
                queue.offer(node.right);
            }
            i++;
        }
        return root;
    }

    public static String toLevelOrderString(TreeNode root, int limit) {
        if (root == null) return "[]";
        List<String> list = new ArrayList<>();
        Queue<TreeNode> queue = new LinkedList<>();
        queue.offer(root);
        int visited = 0;
        while (!queue.isEmpty()) {
            TreeNode curr = queue.poll();
            if (curr != null) {
                if (++visited > limit) {
                    throw new RuntimeException("Cycle detected or binary tree node limit exceeded (max 100,000 nodes)");
                }
                list.add(String.valueOf(curr.val));
                queue.offer(curr.left);
                queue.offer(curr.right);
            } else {
                list.add("null");
            }
        }
        while (!list.isEmpty() && list.get(list.size() - 1).equals("null")) {
            list.remove(list.size() - 1);
        }
        return "[" + String.join(",", list) + "]";
    }
}

class Treenode extends TreeNode {
    public Treenode() { super(); }
    public Treenode(int val) { super(val); }
    public Treenode(int val, TreeNode left, TreeNode right) { super(val, left, right); }
}
`;
    }

    if (language === 'python' || language === 'py') {
      const hasUserTreeNode = /\bclass\s+Tree[nN]ode\b/.test(code);
      if (hasUserTreeNode) return 'Treenode = TreeNode\n';
      return `
class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

    @staticmethod
    def from_list(vals):
        if not vals or vals[0] is None:
            return None
        from collections import deque
        root = TreeNode(vals[0])
        q = deque([root])
        i = 1
        while q and i < len(vals):
            curr = q.popleft()
            if i < len(vals) and vals[i] is not None:
                curr.left = TreeNode(vals[i])
                q.append(curr.left)
            i += 1
            if i < len(vals) and vals[i] is not None:
                curr.right = TreeNode(vals[i])
                q.append(curr.right)
            i += 1
        return root

    @staticmethod
    def to_list(root, limit=${MAX_TREE_NODES}):
        if not root:
            return []
        from collections import deque
        res = []
        q = deque([root])
        visited = 0
        while q:
            curr = q.popleft()
            if curr:
                visited += 1
                if visited > limit:
                    raise RuntimeError("Cycle detected or binary tree node limit exceeded (max 100,000 nodes)")
                res.append(curr.val)
                q.append(curr.left)
                q.append(curr.right)
            else:
                res.append(None)
        while res and res[-1] is None:
            res.pop()
        return res

Treenode = TreeNode
`;
    }

    if (language === 'javascript' || language === 'js' || language === 'node') {
      const hasUserTreeNode = /\b(?:function|class)\s+Tree[nN]ode\b/.test(code);
      if (hasUserTreeNode) return 'const Treenode = TreeNode;\n';
      return `
function TreeNode(val, left, right) {
    this.val = (val === undefined ? 0 : val);
    this.left = (left === undefined ? null : left);
    this.right = (right === undefined ? null : right);
}
TreeNode.fromArray = function(arr) {
    if (!Array.isArray(arr) || arr.length === 0 || arr[0] === null || arr[0] === undefined) return null;
    let root = new TreeNode(arr[0]);
    let queue = [root];
    let i = 1;
    while (queue.length > 0 && i < arr.length) {
        let curr = queue.shift();
        if (i < arr.length && arr[i] !== null && arr[i] !== undefined) {
            curr.left = new TreeNode(arr[i]);
            queue.push(curr.left);
        }
        i++;
        if (i < arr.length && arr[i] !== null && arr[i] !== undefined) {
            curr.right = new TreeNode(arr[i]);
            queue.push(curr.right);
        }
        i++;
    }
    return root;
};
TreeNode.toArray = function(root, limit = ${MAX_TREE_NODES}) {
    if (!root) return [];
    let res = [];
    let queue = [root];
    let visited = 0;
    while (queue.length > 0) {
        let curr = queue.shift();
        if (curr) {
            visited++;
            if (visited > limit) {
                throw new Error("Cycle detected or binary tree node limit exceeded (max 100,000 nodes)");
            }
            res.push(curr.val);
            queue.push(curr.left);
            queue.push(curr.right);
        } else {
            res.push(null);
        }
    }
    while (res.length > 0 && res[res.length - 1] === null) {
        res.pop();
    }
    return res;
};
const Treenode = TreeNode;
`;
    }

    return '';
  }

  normalizeOutput(output) {
    if (output === null || output === undefined) return null;
    if (typeof output === 'string') {
      const trimmed = output.trim();
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed;
      }
    }
    return output;
  }

  getStarterTemplate(language, functionName = 'invertTree', parameters = [], returnType = 'TreeNode') {
    const fn = functionName || 'invertTree';
    const params = parameters && parameters.length > 0 ? parameters : [{ name: 'root', type: 'TreeNode*' }];

    if (language === 'python' || language === 'py') {
      const pNames = params.map(p => p.name || 'root').join(', ');
      return `class Solution:\n    def ${fn}(self, ${pNames}):\n        # Write your code here\n        pass\n`;
    }
    if (language === 'javascript' || language === 'js' || language === 'node') {
      const pNames = params.map(p => p.name || 'root').join(', ');
      return `/**\n * Definition for a binary tree node.\n * function TreeNode(val, left, right) {\n *     this.val = (val===undefined ? 0 : val)\n *     this.left = (left===undefined ? null : left)\n *     this.right = (right===undefined ? null : right)\n * }\n */\nfunction ${fn}(${pNames}) {\n  // Write your code here\n}\n`;
    }
    if (language === 'java') {
      const pDecls = params.map(p => `TreeNode ${p.name || 'root'}`).join(', ');
      return `class Solution {\n    public TreeNode ${fn}(${pDecls}) {\n        // Write your code here\n        return root;\n    }\n}\n`;
    }
    if (language === 'cpp' || language === 'c++') {
      const pDecls = params.map(p => `TreeNode* ${p.name || 'root'}`).join(', ');
      return `#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n    TreeNode* ${fn}(${pDecls}) {\n        // Write your code here\n        return root;\n    }\n};\n`;
    }
    return '';
  }
}

export default BinaryTreeAdapter;
