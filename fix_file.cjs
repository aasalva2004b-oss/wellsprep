const fs = require('fs');
let code = fs.readFileSync('src/components/TopicEditorDialog.tsx', 'utf8');

// The issue is simply the amount of closing </div>s at the end.
// Let's replace the end chunk completely.
let replaceEnd = `                        )}
                     </div>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}`;

code = code.replace(/                        \)\}\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*\);\s*}/s, replaceEnd);

fs.writeFileSync('src/components/TopicEditorDialog.tsx', code);
