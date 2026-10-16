const fs = require('fs');

let code = fs.readFileSync('src/components/TopicEditorDialog.tsx', 'utf8');

const lastGoodDiv = '                 </div>\\n              </div>\\n           </div>\\n        </div>\\n      </div>\\n    </div>\\n  );\\n}';
// Let's replace the garbled end with a clean closing block

code = code.replace(/                     <\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*\);\s*}/, `                     </div>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}`);

fs.writeFileSync('src/components/TopicEditorDialog.tsx', code);
