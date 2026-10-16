const fs = require('fs');
const babel = require('@babel/core');

try {
  babel.transformFileSync('src/components/TopicEditorDialog.tsx', {
    presets: ['@babel/preset-typescript', '@babel/preset-react']
  });
  console.log("Parse Success!");
} catch (e) {
  console.error(e.message);
}
