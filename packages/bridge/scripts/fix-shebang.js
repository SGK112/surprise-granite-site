// Strips any shebang from compiled output and replaces with #!/usr/bin/env node
const fs = require('fs')
const file = process.argv[2]
let content = fs.readFileSync(file, 'utf8')
content = content.replace(/^#![^\n]*\n/, '')
fs.writeFileSync(file, '#!/usr/bin/env node\n' + content)
fs.chmodSync(file, 0o755)
