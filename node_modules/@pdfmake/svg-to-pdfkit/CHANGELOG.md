# Changelog

## 0.2.0 - 2026-11-13

- Fixed class selector matching when SVG is passed as a string
- Fixed excessive memory usage and stack overflows caused by nested SVG `<use>` references by limiting expansion size and depth
