const fs = require('fs');
const css = require('css');
const axios = require('axios');
const path = require('path');
const sanitize = require("sanitize-filename");
const stream = require('node:stream');

async function parseCSSForFontFaces(cssFileOrUrl) {

    const basePathName = './data/fonts';
    const url = (new URL(cssFileOrUrl));
    const fontFolder = url.pathname.split('/').pop().split('.')[0];
    const folder = path.resolve(basePathName, fontFolder);

    if (fs.existsSync(folder)) {
        await fs.promises.rm(folder, { recursive: true, force: true });
    }

    fs.mkdirSync(folder, {recursive: true});

    let cssContent;
    let host;

    // Check if the input is a URL or a local file path
    if (cssFileOrUrl.startsWith('http')) {
        // Fetch CSS content from URL
        try {
            const response = await axios.get(cssFileOrUrl);
            cssContent = response.data;
        } catch (error) {
            console.error('Error fetching CSS file:', error.message);
            return;
        }

        host = url.origin;

    } else {
        // Read CSS content from local file
        try {
            cssContent = fs.readFileSync(cssFileOrUrl, 'utf8');
        } catch (error) {
            console.error('Error reading CSS file:', error.message);
            return;
        }
    }

    // Parse CSS content
    const parsedCss = css.parse(cssContent);

    // Extract @font-face rules
    const fontFaces = parsedCss.stylesheet.rules.filter(rule => rule.type === 'font-face');

    const fontSources = {};

    // Extract sources from @font-face rules
    fontFaces.forEach(fontFace => {
        const name = fontFace.declarations.find(decl => decl.property === 'font-family').value;
        const style = fontFace.declarations.find(decl => decl.property === 'font-style')?.value || '';
        const weight = fontFace.declarations.find(decl => decl.property === 'font-weight')?.value || '';

        const sourceDeclaration = fontFace.declarations.find(decl => decl.property === 'src');
        if (sourceDeclaration) {

            if (!fontSources[name]) {
                fontSources[name] = { style, weight, src: {}};
            }

            // Extract URLs from the src declaration
            const urls = sourceDeclaration.value.match(/url\(['"]?(.+?)['"]?\)/g);
            if (urls) {
                urls.forEach(url => {

                    const uri = host + url.replace(/url\(['"]?(.+?)['"]?\)/, '$1');
                    const extension = url.split('.').pop().split(/\#|\?/)[0];
                    const sanitizedName = (sanitize(name + style + weight).replace(/ /g, '-') + '.' + extension);

                    const localePath = path.resolve(folder, sanitizedName);

                    fetch(uri).then(async response => {
                        const dataStream = stream.Readable.fromWeb(response.body)
                        await fs.promises.writeFile(localePath, dataStream)
                    });

                    fontSources[name].src[extension] = {name: sanitizedName, extension, localePath, url: uri };
                });
            }
        }
    })

    // Print results
    console.log('Font sources found:');
    console.log(fontSources);

    const basePath = path.resolve(basePathName, fontFolder);

    const sassOutput = `// general font variables 
$font-path: '../fonts/';
$font-folder: '${fontFolder}';

// local font face definitions
${Object.keys(fontSources).map(fontName => {
    return `@font-face {
  font-family: ${fontName};
  src: ${Object.keys(fontSources[fontName].src).map(format => {
      return 'url("' + fontSources[fontName].src[format].localePath.replace(basePath, '#{$font-path}#{$font-folder}') + '") format("' + format + '")';
    }).join(',\n       ')};
}`
    }).join('\n\n')}
`;

    console.log(sassOutput);

    return fontSources;
}

parseCSSForFontFaces(process.argv[2]);