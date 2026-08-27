/* URETILDI - build_kiosk.py. ELLE DUZENLEME.
   Kaynak: marketing/site/pool.json + game/src/data/cards.js + game/src/core/econ.js */
globalThis.KIOSK = {
 "cards": [
  {
   "id": "EL-002",
   "tr": "Alev Topu",
   "en": "Fireball",
   "rarity": "common",
   "disp": "C",
   "elem": "ember",
   "type": "spell",
   "cost": 2,
   "atk": null,
   "hp": null
  },
  {
   "id": "EL-004",
   "tr": "Lav Aygırı",
   "en": "Lava Stallion",
   "rarity": "common",
   "disp": "C",
   "elem": "ember",
   "type": "creature",
   "cost": 3,
   "atk": 6,
   "hp": 1
  },
  {
   "id": "EL-016",
   "tr": "Mercan Vatozu",
   "en": "Coral Ray",
   "rarity": "common",
   "disp": "C",
   "elem": "tide",
   "type": "creature",
   "cost": 3,
   "atk": 5,
   "hp": 2
  },
  {
   "id": "EL-025",
   "tr": "Polen Kelebeği",
   "en": "Pollen Butterfly",
   "rarity": "common",
   "disp": "C",
   "elem": "bloom",
   "type": "creature",
   "cost": 2,
   "atk": 2,
   "hp": 2
  },
  {
   "id": "EL-035",
   "tr": "Şafak Tarlakuşu",
   "en": "Dawn Lark",
   "rarity": "common",
   "disp": "C",
   "elem": "radiant",
   "type": "creature",
   "cost": 1,
   "atk": 3,
   "hp": 1
  },
  {
   "id": "EL-046",
   "tr": "Gece Engereği",
   "en": "Night Viper",
   "rarity": "common",
   "disp": "C",
   "elem": "umbra",
   "type": "creature",
   "cost": 2,
   "atk": 3,
   "hp": 1
  },
  {
   "id": "EL-006",
   "tr": "Köz Çakalı",
   "en": "Ember Jackal",
   "rarity": "uncommon",
   "disp": "U",
   "elem": "ember",
   "type": "creature",
   "cost": 3,
   "atk": 5,
   "hp": 1
  },
  {
   "id": "EL-017",
   "tr": "Mürekkep Ahtapotu",
   "en": "Ink Octopus",
   "rarity": "uncommon",
   "disp": "U",
   "elem": "tide",
   "type": "creature",
   "cost": 2,
   "atk": 3,
   "hp": 3
  },
  {
   "id": "EL-028",
   "tr": "Orman Şarkısı",
   "en": "Forest Song",
   "rarity": "uncommon",
   "disp": "U",
   "elem": "bloom",
   "type": "spell",
   "cost": 2,
   "atk": null,
   "hp": null
  },
  {
   "id": "EL-041",
   "tr": "Tapınak Fili",
   "en": "Temple Elephant",
   "rarity": "uncommon",
   "disp": "U",
   "elem": "radiant",
   "type": "creature",
   "cost": 5,
   "atk": 7,
   "hp": 3
  },
  {
   "id": "EL-051",
   "tr": "Obsidyen Panteri",
   "en": "Obsidian Panther",
   "rarity": "uncommon",
   "disp": "U",
   "elem": "umbra",
   "type": "creature",
   "cost": 4,
   "atk": 7,
   "hp": 1
  },
  {
   "id": "EL-009",
   "tr": "Akkor Boğası",
   "en": "Incandescent Bull",
   "rarity": "rare",
   "disp": "R",
   "elem": "ember",
   "type": "creature",
   "cost": 4,
   "atk": 6,
   "hp": 1
  },
  {
   "id": "EL-019",
   "tr": "Kandil Denizanası",
   "en": "Glow Jellyfish",
   "rarity": "rare",
   "disp": "R",
   "elem": "tide",
   "type": "creature",
   "cost": 2,
   "atk": 3,
   "hp": 1
  },
  {
   "id": "EL-030",
   "tr": "Orman Ayısı Yavrusu",
   "en": "Forest Bear Cub",
   "rarity": "rare",
   "disp": "R",
   "elem": "bloom",
   "type": "creature",
   "cost": 2,
   "atk": 2,
   "hp": 2
  },
  {
   "id": "EL-043",
   "tr": "Adalet Çağrısı",
   "en": "Call of Justice",
   "rarity": "rare",
   "disp": "R",
   "elem": "radiant",
   "type": "spell",
   "cost": 4,
   "atk": null,
   "hp": null
  },
  {
   "id": "EL-053",
   "tr": "Kara Dul Örümceği",
   "en": "Black Widow",
   "rarity": "rare",
   "disp": "R",
   "elem": "umbra",
   "type": "creature",
   "cost": 5,
   "atk": 7,
   "hp": 2
  },
  {
   "id": "EL-010",
   "tr": "Ateş kaplanı",
   "en": "Fire Tiger",
   "rarity": "epic",
   "disp": "RR",
   "elem": "ember",
   "type": "creature",
   "cost": 5,
   "atk": 9,
   "hp": 2
  },
  {
   "id": "EL-021",
   "tr": "Buz Kilidi",
   "en": "Ice Lock",
   "rarity": "epic",
   "disp": "RR",
   "elem": "tide",
   "type": "spell",
   "cost": 3,
   "atk": null,
   "hp": null
  },
  {
   "id": "EL-044",
   "tr": "Işık Tazısı",
   "en": "Light Hound",
   "rarity": "epic",
   "disp": "RR",
   "elem": "radiant",
   "type": "creature",
   "cost": 3,
   "atk": 4,
   "hp": 2
  },
  {
   "id": "EL-011",
   "tr": "Kızıl Anka",
   "en": "Crimson Phoenix",
   "rarity": "legendary",
   "disp": "RR",
   "elem": "ember",
   "type": "creature",
   "cost": 5,
   "atk": 10,
   "hp": 2
  },
  {
   "id": "EL-034",
   "tr": "Asırlık Çınar",
   "en": "Elder Sycamore",
   "rarity": "legendary",
   "disp": "RR",
   "elem": "bloom",
   "type": "creature",
   "cost": 6,
   "atk": 8,
   "hp": 5
  },
  {
   "id": "EL-055",
   "tr": "Elementa'nın Kalbi",
   "en": "Heart of Elementa",
   "rarity": "mythic",
   "disp": "RR",
   "elem": "all",
   "type": "creature",
   "cost": 6,
   "atk": 5,
   "hp": 5
  },
  {
   "id": "PR-005",
   "tr": "Kıyı Şeridi Fatihi",
   "en": "Coastline Conqueror",
   "rarity": "promo",
   "disp": "P",
   "elem": "tide",
   "type": "creature",
   "cost": 4,
   "atk": 3,
   "hp": 5
  },
  {
   "id": "PR-013",
   "tr": "Gezgin Silas",
   "en": "Silas the Wanderer",
   "rarity": "promo",
   "disp": "P",
   "elem": "umbra",
   "type": "creature",
   "cost": 3,
   "atk": 4,
   "hp": 4
  }
 ],
 "rarity": {
  "common": {
   "main": "#9a948c",
   "light": "#c3bdb4",
   "dark": "#6e6960"
  },
  "uncommon": {
   "main": "#b0793a",
   "light": "#d99a55",
   "dark": "#7d5527"
  },
  "rare": {
   "main": "#a9b6c4",
   "light": "#dfe7ef",
   "dark": "#75828f"
  },
  "epic": {
   "main": "#d9a13e",
   "light": "#f5d97a",
   "dark": "#a3742a"
  },
  "legendary": {
   "main": "#b087d9",
   "light": "#e8c8f5",
   "dark": "#7a5aa3"
  },
  "mythic": {
   "main": "#d97fb0",
   "light": "#f5c8e0",
   "dark": "#a35a85"
  },
  "promo": {
   "main": "#4a9a8a",
   "light": "#7ac8b8",
   "dark": "#337065"
  }
 },
 "odds": [
  [
   "standard",
   50
  ],
  [
   "expansion",
   28
  ],
  [
   "event",
   17
  ],
  [
   "collector",
   5
  ]
 ],
 "packs": {
  "standard": {
   "cards": 5,
   "std": [
    [
     "common",
     78
    ],
    [
     "uncommon",
     20
    ],
    [
     "rare",
     2
    ]
   ],
   "hit": [
    [
     "uncommon",
     79
    ],
    [
     "rare",
     16
    ],
    [
     "epic",
     4
    ],
    [
     "legendary",
     0.9
    ],
    [
     "mythic",
     0.1
    ]
   ],
   "promoChance": 0,
   "foil": 0.06,
   "foilHit": 0.2,
   "tear": [
    11,
    11
   ]
  },
  "expansion": {
   "cards": 5,
   "std": [
    [
     "common",
     72
    ],
    [
     "uncommon",
     25
    ],
    [
     "rare",
     3
    ]
   ],
   "hit": [
    [
     "uncommon",
     70.5
    ],
    [
     "rare",
     22
    ],
    [
     "epic",
     6
    ],
    [
     "legendary",
     1.4
    ],
    [
     "mythic",
     0.1
    ]
   ],
   "promoChance": 0,
   "foil": 0.06,
   "foilHit": 0.2,
   "tear": [
    11,
    11
   ]
  },
  "event": {
   "cards": 5,
   "std": [
    [
     "common",
     78
    ],
    [
     "uncommon",
     20
    ],
    [
     "rare",
     2
    ]
   ],
   "hit": [
    [
     "uncommon",
     79
    ],
    [
     "rare",
     16
    ],
    [
     "epic",
     4
    ],
    [
     "legendary",
     0.9
    ],
    [
     "mythic",
     0.1
    ]
   ],
   "promoChance": 0.1,
   "foil": 0.06,
   "foilHit": 0.2,
   "tear": [
    24,
    6
   ]
  },
  "collector": {
   "cards": 5,
   "std": [
    [
     "uncommon",
     70
    ],
    [
     "rare",
     30
    ]
   ],
   "hit": [
    [
     "rare",
     62
    ],
    [
     "epic",
     28
    ],
    [
     "legendary",
     8.5
    ],
    [
     "mythic",
     1.5
    ]
   ],
   "promoChance": 0,
   "foil": 0.18,
   "foilHit": 0.38,
   "tear": [
    9,
    9
   ]
  }
 },
 "langs": [
  "tr",
  "en"
 ],
 "cw": 96,
 "ch": 144,
 "fx": {
  "EL-002": {
   "profile": null,
   "overlay": "foil",
   "fullArt": false,
   "maskFlip": false,
   "masks": [
    "foil"
   ]
  },
  "EL-004": {
   "profile": null,
   "overlay": "foil",
   "fullArt": false,
   "maskFlip": false,
   "masks": [
    "foil"
   ]
  },
  "EL-016": {
   "profile": null,
   "overlay": "foil",
   "fullArt": false,
   "maskFlip": false,
   "masks": [
    "foil"
   ]
  },
  "EL-025": {
   "profile": null,
   "overlay": "foil",
   "fullArt": false,
   "maskFlip": false,
   "masks": [
    "foil"
   ]
  },
  "EL-035": {
   "profile": null,
   "overlay": "foil",
   "fullArt": false,
   "maskFlip": false,
   "masks": [
    "foil"
   ]
  },
  "EL-046": {
   "profile": null,
   "overlay": "foil",
   "fullArt": false,
   "maskFlip": false,
   "masks": [
    "foil"
   ]
  },
  "EL-006": {
   "profile": null,
   "overlay": "foil",
   "fullArt": false,
   "maskFlip": false,
   "masks": [
    "foil"
   ]
  },
  "EL-017": {
   "profile": null,
   "overlay": "foil",
   "fullArt": false,
   "maskFlip": false,
   "masks": [
    "foil"
   ]
  },
  "EL-028": {
   "profile": null,
   "overlay": "foil",
   "fullArt": false,
   "maskFlip": false,
   "masks": [
    "foil"
   ]
  },
  "EL-041": {
   "profile": null,
   "overlay": "foil",
   "fullArt": false,
   "maskFlip": false,
   "masks": [
    "foil"
   ]
  },
  "EL-051": {
   "profile": null,
   "overlay": "foil",
   "fullArt": false,
   "maskFlip": false,
   "masks": [
    "foil"
   ]
  },
  "EL-009": {
   "profile": "holo",
   "overlay": "foil",
   "fullArt": false,
   "maskFlip": false,
   "masks": [
    "foil",
    "holo"
   ]
  },
  "EL-019": {
   "profile": "holo",
   "overlay": "foil",
   "fullArt": false,
   "maskFlip": false,
   "masks": [
    "foil",
    "holo"
   ]
  },
  "EL-030": {
   "profile": "holo",
   "overlay": "foil",
   "fullArt": false,
   "maskFlip": false,
   "masks": [
    "foil",
    "holo"
   ]
  },
  "EL-043": {
   "profile": "holo",
   "overlay": "foil",
   "fullArt": false,
   "maskFlip": false,
   "masks": [
    "foil",
    "holo"
   ]
  },
  "EL-053": {
   "profile": "holo",
   "overlay": "foil",
   "fullArt": false,
   "maskFlip": false,
   "masks": [
    "foil",
    "holo"
   ]
  },
  "EL-010": {
   "profile": "rainbow",
   "overlay": "foil",
   "fullArt": false,
   "maskFlip": false,
   "masks": [
    "foil",
    "rainbow"
   ]
  },
  "EL-021": {
   "profile": "rainbow",
   "overlay": "foil",
   "fullArt": false,
   "maskFlip": false,
   "masks": [
    "foil",
    "rainbow"
   ]
  },
  "EL-044": {
   "profile": "rainbow",
   "overlay": "foil",
   "fullArt": false,
   "maskFlip": false,
   "masks": [
    "foil",
    "rainbow"
   ]
  },
  "EL-011": {
   "profile": "prismfoil",
   "overlay": "foil",
   "fullArt": false,
   "maskFlip": false,
   "masks": [
    "foil",
    "prismfoil"
   ]
  },
  "EL-034": {
   "profile": "prismfoil",
   "overlay": "foil",
   "fullArt": false,
   "maskFlip": false,
   "masks": [
    "foil",
    "prismfoil"
   ]
  },
  "EL-055": {
   "profile": "prismfoil",
   "overlay": "foil",
   "fullArt": false,
   "maskFlip": false,
   "masks": [
    "foil",
    "prismfoil"
   ]
  },
  "PR-005": {
   "profile": "holo",
   "overlay": "foil",
   "fullArt": true,
   "maskFlip": false,
   "masks": [
    "foil",
    "holo"
   ]
  },
  "PR-013": {
   "profile": "foil",
   "overlay": null,
   "fullArt": true,
   "maskFlip": false,
   "masks": [
    "foil"
   ]
  }
 }
};
