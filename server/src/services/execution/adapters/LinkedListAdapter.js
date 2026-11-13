import { BaseAdapter } from './BaseAdapter.js';

export const MAX_LINKED_LIST_NODES = 100000;

/**
 * LinkedListAdapter
 * Specializes in Singly Linked Lists with node limit enforcement (100,000 max)
 * and cycle detection across C++, Java, Python, and JavaScript.
 */
export class LinkedListAdapter extends BaseAdapter {
  constructor() {
    super('LINKED_LIST');
  }

  /**
   * Returns language-specific ListNode declaration if not already declared in user code.
   */
  getTypeDeclarations(language, options = {}) {
    const { code = '' } = options;

    if (language === 'cpp' || language === 'c++') {
      const hasUserListNode = /\b(?:struct|class)\s+ListNode\b/.test(code);
      if (hasUserListNode) return 'using Listnode = ListNode;\n';
      return `
// Definition for singly-linked list.
struct ListNode {
    int val;
    ListNode *next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode *next) : val(x), next(next) {}

    static ListNode* fromVec(const vector<int>& v) {
        ListNode dummy;
        ListNode* cur = &dummy;
        for (int x : v) {
            cur->next = new ListNode(x);
            cur = cur->next;
        }
        return dummy.next;
    }

    static vector<int> toVec(ListNode* h, int limit = ${MAX_LINKED_LIST_NODES}) {
        vector<int> res;
        int count = 0;
        while (h) {
            if (++count > limit) {
                throw runtime_error("Cycle detected or linked list traversal limit exceeded (max 100,000 nodes)");
            }
            res.push_back(h->val);
            h = h->next;
        }
        return res;
    }

    static void deleteList(ListNode* h, int limit = ${MAX_LINKED_LIST_NODES}) {
        int count = 0;
        while (h && ++count <= limit) {
            ListNode* nxt = h->next;
            delete h;
            h = nxt;
        }
    }
};
using Listnode = ListNode;
`;
    }

    if (language === 'java') {
      const hasUserListNode = /\bclass\s+ListNode\b/.test(code);
      if (hasUserListNode) {
        return `
class Listnode extends ListNode {
    public Listnode() { super(); }
    public Listnode(int val) { super(val); }
    public Listnode(int val, ListNode next) { super(val, next); }
}
`;
      }
      return `
class ListNode {
    public int val;
    public ListNode next;
    public ListNode() {}
    public ListNode(int val) { this.val = val; }
    public ListNode(int val, ListNode next) { this.val = val; this.next = next; }

    public static ListNode fromArray(int[] arr) {
        if (arr == null || arr.length == 0) return null;
        ListNode dummy = new ListNode(0);
        ListNode curr = dummy;
        for (int v : arr) {
            curr.next = new ListNode(v);
            curr = curr.next;
        }
        return dummy.next;
    }

    public static String toListString(ListNode head, int limit) {
        StringBuilder sb = new StringBuilder("[");
        ListNode curr = head;
        boolean first = true;
        int count = 0;
        while (curr != null) {
            if (++count > limit) {
                throw new RuntimeException("Cycle detected or linked list traversal limit exceeded (max 100,000 nodes)");
            }
            if (!first) sb.append(",");
            sb.append(curr.val);
            first = false;
            curr = curr.next;
        }
        sb.append("]");
        return sb.toString();
    }
}

class Listnode extends ListNode {
    public Listnode() { super(); }
    public Listnode(int val) { super(val); }
    public Listnode(int val, ListNode next) { super(val, next); }
}
`;
    }

    if (language === 'python' || language === 'py') {
      const hasUserListNode = /\bclass\s+ListNode\b/.test(code);
      if (hasUserListNode) return 'Listnode = ListNode\n';
      return `
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

    @staticmethod
    def from_list(vals):
        if not vals:
            return None
        dummy = ListNode(0)
        curr = dummy
        for v in vals:
            curr.next = ListNode(v)
            curr = curr.next
        return dummy.next

    @staticmethod
    def to_list(head, limit=${MAX_LINKED_LIST_NODES}):
        res = []
        curr = head
        count = 0
        while curr:
            count += 1
            if count > limit:
                raise RuntimeError("Cycle detected or linked list traversal limit exceeded (max 100,000 nodes)")
            res.append(curr.val)
            curr = curr.next
        return res

Listnode = ListNode
`;
    }

    if (language === 'javascript' || language === 'js' || language === 'node') {
      const hasUserListNode = /\b(?:function|class)\s+ListNode\b/.test(code);
      if (hasUserListNode) return 'const Listnode = ListNode;\n';
      return `
function ListNode(val, next) {
    this.val = (val === undefined ? 0 : val);
    this.next = (next === undefined ? null : next);
}
ListNode.fromArray = function(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return null;
    let dummy = new ListNode(0);
    let curr = dummy;
    for (let v of arr) {
        curr.next = new ListNode(v);
        curr = curr.next;
    }
    return dummy.next;
};
ListNode.toArray = function(head, limit = ${MAX_LINKED_LIST_NODES}) {
    let res = [];
    let curr = head;
    let count = 0;
    while (curr) {
        count++;
        if (count > limit) {
            throw new Error("Cycle detected or linked list traversal limit exceeded (max 100,000 nodes)");
        }
        res.push(curr.val);
        curr = curr.next;
    }
    return res;
};
const Listnode = ListNode;
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

  getStarterTemplate(language, functionName = 'reverseList', parameters = [], returnType = 'ListNode') {
    const fn = functionName || 'reverseList';
    const params = parameters && parameters.length > 0 ? parameters : [{ name: 'head', type: 'ListNode*' }];

    if (language === 'python' || language === 'py') {
      const pNames = params.map(p => p.name || 'head').join(', ');
      return `class Solution:\n    def ${fn}(self, ${pNames}):\n        # Write your code here\n        pass\n`;
    }
    if (language === 'javascript' || language === 'js' || language === 'node') {
      const pNames = params.map(p => p.name || 'head').join(', ');
      return `/**\n * Definition for singly-linked list.\n * function ListNode(val, next) {\n *     this.val = (val===undefined ? 0 : val)\n *     this.next = (next===undefined ? null : next)\n * }\n */\nfunction ${fn}(${pNames}) {\n  // Write your code here\n}\n`;
    }
    if (language === 'java') {
      const pDecls = params.map(p => `ListNode ${p.name || 'head'}`).join(', ');
      return `class Solution {\n    public ListNode ${fn}(${pDecls}) {\n        // Write your code here\n        return head;\n    }\n}\n`;
    }
    if (language === 'cpp' || language === 'c++') {
      const pDecls = params.map(p => `ListNode* ${p.name || 'head'}`).join(', ');
      return `#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n    ListNode* ${fn}(${pDecls}) {\n        // Write your code here\n        return head;\n    }\n};\n`;
    }
    return '';
  }
}

export default LinkedListAdapter;
