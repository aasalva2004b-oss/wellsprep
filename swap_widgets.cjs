const fs = require('fs');

let code = fs.readFileSync('src/components/TopicEditorDialog.tsx', 'utf8');

const leftColStart = code.indexOf('{/* LEFT COLUMN: Data Input (Log Session & Settings) - Col Span 4 */}');
const rightColStart = code.indexOf('{/* RIGHT COLUMN: Dashboard & History - Col Span 8 */}');

if (leftColStart !== -1 && rightColStart !== -1) {
    let leftColCode = code.substring(leftColStart, rightColStart);
    
    const registroStart = leftColCode.indexOf('{/* Registro de Sesión (Log Form) */}');
    const detallesStart = leftColCode.indexOf('{/* Detalles del Tema */}');
    
    // We want everything from detallesStart up to the end of leftColCode (which ends with </div>)
    // Actually, let's find the closing div of "Detalles del Tema".
    const endLeftCol = leftColCode.lastIndexOf('</div>');
    
    const block1 = leftColCode.substring(registroStart, detallesStart); // Registro
    const block2 = leftColCode.substring(detallesStart, endLeftCol); // Detalles
    
    // Check if there are trailing closing divs that belong to the leftCol
    const beforeBlocks = leftColCode.substring(0, registroStart);
    const afterBlocks = leftColCode.substring(endLeftCol);

    const newLeftColCode = beforeBlocks + block2 + '\n                 ' + block1 + afterBlocks;
    
    code = code.substring(0, leftColStart) + newLeftColCode + code.substring(rightColStart);
    fs.writeFileSync('src/components/TopicEditorDialog.tsx', code);
    console.log("Successfully swapped widgets.");
} else {
    console.error("Could not find delimiters.");
}
