import {
    createYamlBlockDefinitions,
    createYamlBlockMenus,
    createYamlBlockOpcodes,
    type YamlBlockOpcodes,
} from '../src/yaml-blocks.js';
const operations = createYamlBlockOpcodes('owner_');
const line: string | undefined = operations.lineComment;
const inline: string | undefined = operations.inlineComment;
const old: YamlBlockOpcodes = {
    map: 'm',
    pair: 'p',
    sequence: 's',
    item: 'i',
    scalar: 'v',
    text: 't',
    textLine: 'l',
    comment: 'c',
};
const hidden: boolean | undefined = createYamlBlockDefinitions()[0]!.hideFromPalette;
const choices: string[] = createYamlBlockMenus().yamlLineCommentPlacements.items;
void [line, inline, old, hidden, choices];
