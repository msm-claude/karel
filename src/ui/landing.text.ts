// The landing copy per language. Values may carry inline HTML (`<code>`), they go in by innerHTML.
import type { LocaleId } from '../lang/index';

export const landingText: Record<LocaleId, Record<string, string>> = {
  sk: {
    title: 'Karel – robot, ktorý robí presne to, čo napíšeš',
    description: 'Karel je robot v miestnosti z kociek. Napíšeš mu program po slovensky, spustíš ho a pozeráš, čo urobí. Bez účtu, bez inštalácie.',
    h1: 'Robot, ktorý robí presne to, čo napíšeš.',
    pitch:
      'Karel stojí v miestnosti z kociek. Vie urobiť krok, otočiť sa, položiť a zdvihnúť tehlu, dať značku. Nič viac. Všetko ostatné ho naučíš ty: napíšeš program, spustíš ho a pozeráš, čo urobí.',
    open: 'Otvoriť Karla',
    tasks: 'Zadania',
    comment: '# Karel postaví múrik a označí, kde skončil',
    programH: 'Program',
    programP:
      'Príkazy sa píšu po slovensky, bez diakritiky: <code>krok</code>, <code>vlavo</code>, <code>poloz</code>. Z nich skladáš vlastné príkazy, opakovanie a podmienky. Program beží krok po kroku, chyba zastaví na riadku, kde vznikla.',
    roomH: 'Miestnosť',
    roomP: 'Miestnosť si postavíš klikaním na podlahu: tehly, značky, diery, Karlov štart. Alebo otvoríš hotovú mapu zo zadania a rovno píšeš.',
    linkH: 'Odkaz',
    linkP:
      'Miestnosť aj program sa zmestia do adresy stránky. Pošleš odkaz a druhý vidí to isté. Bez účtu, bez servera, bez inštalácie; funguje aj na iPade.',
    credit: 'Karel vychádza z konceptu Richarda E. Pattisa, Karel the Robot (1981).',
    source: 'Zdrojový kód',
  },
  cs: {
    title: 'Karel – robot, který dělá přesně to, co napíšeš',
    description: 'Karel je robot v místnosti z kostek. Napíšeš mu program česky, spustíš ho a díváš se, co udělá. Bez účtu, bez instalace.',
    h1: 'Robot, který dělá přesně to, co napíšeš.',
    pitch:
      'Karel stojí v místnosti z kostek. Umí udělat krok, otočit se, položit a zvednout cihlu, dát značku. Nic víc. Všechno ostatní ho naučíš ty: napíšeš program, spustíš ho a díváš se, co udělá.',
    open: 'Otevřít Karla',
    tasks: 'Zadání',
    comment: '# Karel postaví zídku a označí, kde skončil',
    programH: 'Program',
    programP:
      'Příkazy se píšou česky, bez diakritiky: <code>krok</code>, <code>vlevo</code>, <code>poloz</code>. Z nich skládáš vlastní příkazy, opakování a podmínky. Program běží krok za krokem, chyba zastaví na řádku, kde vznikla.',
    roomH: 'Místnost',
    roomP: 'Místnost si postavíš klikáním na podlahu: cihly, značky, díry, Karlův start. Nebo otevřeš hotovou mapu ze zadání a rovnou píšeš.',
    linkH: 'Odkaz',
    linkP:
      'Místnost i program se vejdou do adresy stránky. Pošleš odkaz a druhý vidí totéž. Bez účtu, bez serveru, bez instalace; funguje i na iPadu.',
    credit: 'Karel vychází z konceptu Richarda E. Pattise, Karel the Robot (1981).',
    source: 'Zdrojový kód',
  },
  en: {
    title: 'Karel – a robot that does exactly what you write',
    description: 'Karel is a robot in a room of blocks. You write it a program in plain words, run it and watch what it does. No account, no install.',
    h1: 'A robot that does exactly what you write.',
    pitch:
      'Karel stands in a room of blocks. It can step, turn, place and pick up a brick, put down a mark. Nothing more. Everything else you teach it: write a program, run it and watch what it does.',
    open: 'Open Karel',
    tasks: 'Tasks',
    comment: '# Karel builds a wall and marks where it ended',
    programH: 'Program',
    programP:
      'Commands are plain words: <code>step</code>, <code>left</code>, <code>put</code>. From those you build your own commands, loops and conditions. The program runs step by step; an error stops on the line where it happened.',
    roomH: 'Room',
    roomP: 'You build the room by clicking the floor: bricks, marks, holes, Karel’s start. Or open a ready map from a task and start writing.',
    linkH: 'Link',
    linkP:
      'The room and the program fit into the page address. Send the link and the other person sees the same thing. No account, no server, no install; works on an iPad too.',
    credit: 'Karel follows the concept of Richard E. Pattis, Karel the Robot (1981).',
    source: 'Source code',
  },
};
