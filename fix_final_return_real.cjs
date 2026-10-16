const fs = require('fs');

let code = fs.readFileSync('src/components/TopicEditorDialog.tsx', 'utf8');

// I am just going to append 2 </div> tags. The error is literally: Unexpected end of file before a closing "div" tag.
code = code.replace(/      <\/div>\n    <\/div>\n  \);\n}/, '      </div>\n    </div>\n    </div>\n    </div>\n  );\n}');

fs.writeFileSync('src/components/TopicEditorDialog.tsx', code);
