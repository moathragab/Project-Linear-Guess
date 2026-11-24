# @pdfmake/svg-to-pdfkit
Insert SVG into a PDF document created with PDFKit.

## Install

```sh
npm install @pdfmake/svg-to-pdfkit --save
```

## Use

```sh
SVGtoPDF(doc, svg, x, y, options);
```

&nbsp; &nbsp; If you prefer, you can add the function to the PDFDocument prototype:

```sh
PDFDocument.prototype.addSVG = function(svg, x, y, options) {
  return SVGtoPDF(this, svg, x, y, options), this;
};
```

&nbsp; &nbsp; And then simply call:

```sh
doc.addSVG(svg, x, y, options);
```

## Parameters

    doc [PDFDocument] = the PDF document created with PDFKit
    svg [SVGElement or string] = the SVG object or XML code
    x, y [number] = the position where the SVG will be added
    options [Object] = >
      - width, height [number] = initial viewport, by default it's the page dimensions
      - preserveAspectRatio [string] = override alignment of the SVG content inside its viewport
      - useCSS [boolean] = use the CSS styles computed by the browser (for SVGElement only)
      - fontCallback [function] = function called to get the fonts, see source code
      - imageCallback [function] = same as above for the images (for Node.js)
      - documentCallback [function] = same as above for the external SVG documents
      - colorCallback [function] = function called to get color, making mapping to CMYK possible
      - warningCallback [function] = function called when there is a warning
      - assumePt [boolean] = assume that units are PDF points instead of SVG pixels
      - precision [number] = precision factor for approximative calculations (default = 3)

## Fonts
In the browser, it's easier to register fonts (<a href="https://github.com/foliojs/pdfkit/issues/623#issuecomment-284625259">see here how</a>) before calling SVGtoPDF. SVGtoPDF doesn't wait for font loading with asynchronous XMLHttpRequest.

Make sure to name the fonts with the exact pattern 'MyFont', 'MyFont-Bold', 'MyFont-Italic', 'MyFont-BoldItalic' (case sensitive), if the font is named font-family="MyFont" in the svg. Missing Bold, Italic, BoldItalic fonts are simulated with stroke and skew angle.

If your fonts don't follow this pattern, or you want to register fonts at the moment they are encountered in the svg, you can use a custom fontCallback function.

## Supported
 - shapes: rect, circle, path, ellipse, line, polyline, polygon
 - special elements: use, nested svg
 - text elements: text, tspan, textPath
 - text attributes: x, y, dx, dy, rotate, text-anchor, textLength, word-spacing, letter-spacing, font-size
 - styling: with attributes only
 - colors: fill, stroke & color (rgb, rgba, hex, string), fill-opacity, stroke-opacity & opacity
 - units: all standard units
 - transformations: transform, viewBox & preserveAspectRatio attributes
 - clip paths & masks
 - images
 - fonts
 - gradients
 - patterns
 - links

## Unsupported
 - filters
 - text attributes: font-variant, writing-mode, unicode-bidi
 - vector-effect
 - foreignObject
 - other things I don't even know they exist

## License
MIT

## Authors

Based on [SVG-to-PDFKit](https://github.com/alafr/SVG-to-PDFKit).

* [@alafr](https://github.com/alafr) (original author, no longer maintaining the project)
* [@liborm85](https://github.com/liborm85)

Thanks to all contributors.
