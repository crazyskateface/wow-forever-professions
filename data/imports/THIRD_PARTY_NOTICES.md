# Third-party notices

The transformed dataset in this directory incorporates data from:

- LibProfessionDB v1.9.1, Forever client build 1.60.1.69977: <https://www.curseforge.com/wow/addons/libprofessiondb/files/9095167>
- LibProfessionDB v1.9.1, Vanilla client build 1.15.9.69722 (Classic Era baseline): <https://www.curseforge.com/wow/addons/libprofessiondb/files/9095167>
- LibItemDB v1.6.0, Forever English item names and item classifications: <https://www.curseforge.com/wow/addons/libitemdb/files/9233325>
- LibItemDB v1.6.0, Vanilla English item names and item classifications: <https://www.curseforge.com/wow/addons/libitemdb/files/9233325>

Source archive SHA-256 checksums used for this transform:

- `ProfessionDB-ProfessionDB-v1.9.1.zip`: `909cb41720cf6bf6920f1c25c644f89b39ad63087f589c07737e7da943c52379`
- `ItemDB-ItemDB-v1.6.0.zip`: `d200101f01f2e501fef0362dd5199991e930ad79c8e60080a205e4506ace5eed`

Both source archives include the following license:

```text
MIT License

Copyright (c) 2026 Pimptasty

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

The item icon files under `apps/web/public/icons/items/` are World of Warcraft
artwork extracted from the locally installed World of Warcraft: Forever client.
They are © Blizzard Entertainment and are not covered by the MIT license above.
The generated manifest identifies the client build and FileDataID used for each
asset. World of Warcraft and Blizzard Entertainment are trademarks or registered
trademarks of Blizzard Entertainment, Inc.

The complete profession snapshots also include item labels, rarity, and tooltip
metadata extracted from installed Forever product `wowf`, client build
`1.60.1.70630`, locale `enUS`. These client facts retain Blizzard attribution;
MIT licensing of the source libraries does not relicense Blizzard game data.
The earlier Leatherworking-only snapshots retain their original client provenance.
