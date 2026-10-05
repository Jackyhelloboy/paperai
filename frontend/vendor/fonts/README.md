# PaperAI Devanagari font

PaperAIDevanagari-Regular.ttf is a static, renamed instance of Noto Sans
Devanagari at weight 400 and width 100. The complete character set and shaping
tables are retained so exported documents can be edited in desktop Word.

Source: https://github.com/google/fonts/blob/main/ofl/notosansdevanagari/NotoSansDevanagari%5Bwdth%2Cwght%5D.ttf
Source Git blob: 163f04bddc5a96fc523e4080466cac5c588f6594
License: SIL Open Font License 1.1, included in OFL.txt.

Generated with fontTools 4.61.1 varLib.instancer at wght=400, wdth=100. Family,
full, PostScript, preferred-family and unique names were changed to avoid
conflicting with installed Noto fonts. No glyphs were removed. OS/2 fsType=0
permits installable embedding.

The font loads only when a Devanagari Word export is requested. Export then
embeds the complete font in the DOCX, using the ECMA-376 first-32-byte XOR
obfuscation. Text remains Unicode, searchable and editable.
