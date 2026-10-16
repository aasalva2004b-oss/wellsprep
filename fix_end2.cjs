const fs = require('fs');
let code = fs.readFileSync('src/components/TopicEditorDialog.tsx', 'utf8');

// There's a missing closing </div> tag. The error said line 274: JSX element 'div' has no corresponding closing tag.
const search274 = code.substring(0, 10000); // look for early divs
// Let's count open/close tags for div.
const countOpen = (code.match(/<div/g) || []).length;
const countClose = (code.match(/<\/div>/g) || []).length;
console.log(`Open: ${countOpen}, Close: ${countClose}`);

// We are likely missing 2 closing divs at the very end
code = code.replace(/    <\/div>\n  \);\n}\n$/, '    </div>\n      </div>\n    </div>\n  );\n}\n');

// Also, let's just do a brute force search for the return body
let returnIndex = code.indexOf('return (');
let returnBody = code.substring(returnIndex);

fs.writeFileSync('src/components/TopicEditorDialog.tsx', code);
