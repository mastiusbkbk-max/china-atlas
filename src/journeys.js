export const themes = [
  { id: 'mountains', label: '名山雪峰', en: 'MOUNTAINS' },
  { id: 'rivers', label: '江河峡谷', en: 'RIVERS & GORGES' },
  { id: 'lakes', label: '湖泊湿地', en: 'LAKES & WETLANDS' },
  { id: 'desert', label: '沙漠与红层', en: 'DESERTS & RED BEDS' },
  { id: 'coast', label: '海岛海岸', en: 'ISLANDS & COASTS' },
  { id: 'cities', label: '古城名都', en: 'CITIES & TOWNS' },
  { id: 'heritage', label: '历史遗产', en: 'CULTURAL HERITAGE' },
  { id: 'gardens', label: '园林乡土', en: 'GARDENS & VILLAGES' },
];

export const provinceNames = ['北京', '天津', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江', '上海', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南', '广东', '广西', '海南', '重庆', '四川', '贵州', '云南', '西藏', '陕西', '甘肃', '青海', '宁夏', '新疆', '台湾', '香港', '澳门'];

// Twelve stops at eleven seconds each keep the introduction close to two minutes.
export const highlights = ['everest', 'yellow-river', 'yangtze', 'guilin', 'huangshan', 'jiuzhaigou', 'zhangye', 'great-wall', 'forbidden-city', 'terracotta', 'suzhou', 'victoria-harbour'];

export const chapters = [
  {
    id: 'terrain', label: '三级阶梯', en: 'THE SHAPE OF THE LAND', title: '从世界屋脊，到东部大地',
    intro: '由高原、盆地走向平原丘陵。沿着中国总体西高东低的地势，辨认大地的骨架与变化。',
    placeIds: ['everest', 'qinghai', 'gongga', 'yangtze', 'zhangjiajie', 'huangshan', 'guilin'],
  },
  {
    id: 'famous-mountains', label: '五岳名山', en: 'MOUNTAINS OF MEMORY', title: '一座山，千年的仰望',
    intro: '五岳各有山势与文化。再向黄山、庐山、武当与三清山，读懂岩石、云雾与信仰。',
    placeIds: ['taishan', 'huashan', 'hengshan-north', 'hengshan-south', 'songshan', 'huangshan', 'lushan', 'wudang', 'sanqingshan'],
  },
  {
    id: 'highlands', label: '雪山高原', en: 'ABOVE THE CLOUDS', title: '在云端，遇见大地的隆起',
    intro: '喜马拉雅、横断山与天山，隆起的山脉拦截水汽，孕育冰川，也承载高地生活。',
    placeIds: ['everest', 'kailash', 'namjagbarwa', 'gongga', 'siguniang', 'yulong', 'tianshan'],
  },
  {
    id: 'rivers', label: '江河峡谷', en: 'A LAND SHAPED BY WATER', title: '循着水，读懂山河',
    intro: '从高原深切峡谷到平原水利，在奔流、跌落和转弯之间，追寻江河塑造土地的力量。',
    placeIds: ['yangtze', 'yellow-river', 'yarlung', 'three-parallel-rivers', 'tiger-leaping', 'guilin', 'detian', 'huangguoshu', 'taroko', 'dujiangyan', 'grand-canal'],
  },
  {
    id: 'lakes', label: '湖泊湿地', en: 'THE MANY LIVES OF A LAKE', title: '一片水，万千种生命',
    intro: '高原咸水湖、淡水湿地、钙华彩池与山地湖泊，各有成因，也各有与人共处的故事。',
    placeIds: ['kanas', 'qinghai', 'namtso', 'jiuzhaigou', 'huanglong', 'poyang', 'dongting', 'west-lake', 'sun-moon-lake', 'chaka'],
  },
  {
    id: 'desert', label: '沙漠红层', en: 'WIND, SAND & TIME', title: '风与时间，留下大地的颜色',
    intro: '从流动沙丘到沉积红层。分辨沙漠、彩色丘陵与丹霞地貌，读懂干旱区和红层的不同。',
    placeIds: ['dunhuang', 'zhangye', 'badain-jaran', 'taklamakan', 'danxiashan', 'helanshan'],
  },
  {
    id: 'forests', label: '山林生态', en: 'THE LIVING MOUNTAINS', title: '山林深处，生命自有秩序',
    intro: '从北方针叶林走向南方雨林。海拔与纬度改变森林面貌，演化与隔离留下珍贵的生命。',
    placeIds: ['changbai', 'greater-khingan', 'shennongjia', 'fanjingshan', 'wuyi', 'emei', 'wulong', 'hainan-rainforest'],
  },
  {
    id: 'coast', label: '海岸岛屿', en: 'WHERE LAND MEETS SEA', title: '向海而生，各有潮声',
    intro: '海蚀岩岸、火山岛、热带海湾与港口聚落，在陆海相遇的地方，认识另一重中国。',
    placeIds: ['jinshitan', 'weizhou', 'sanya', 'gulangyu', 'victoria-harbour', 'macau'],
  },
  {
    id: 'capitals', label: '古都中轴', en: 'BUILDING A CIVILIZATION', title: '城与山河，写下历史的尺度',
    intro: '从秦陵、宫殿到长城、孔庙和山庄。空间秩序与建筑群，让抽象的历史变得可见。',
    placeIds: ['terracotta', 'forbidden-city', 'temple-heaven', 'great-wall', 'qufu', 'chengde'],
  },
  {
    id: 'stone-art', label: '石窟与造像', en: 'STORIES CARVED IN STONE', title: '把千年，留在石壁之间',
    intro: '丝路交流、王朝营造与民间信仰，跨越山川汇入壁画、石刻和山地建筑。',
    placeIds: ['mogao', 'maijishan', 'yungang', 'longmen', 'dazu', 'leshan', 'potala'],
  },
  {
    id: 'cities', label: '古城都市', en: 'PLACES PEOPLE CALL HOME', title: '城里城外，皆是人间',
    intro: '古道、水网和港口塑造城市。走过北方城墙、西南街巷与近代天际线，看见流动的生活。',
    placeIds: ['pingyao', 'dali', 'lijiang', 'phoenix', 'tianjin', 'shanghai-bund', 'victoria-harbour', 'macau'],
  },
  {
    id: 'gardens', label: '园林乡土', en: 'LANDSCAPES OF EVERYDAY LIFE', title: '把山水，安放在日常',
    intro: '园林借景，村落理水，梯田顺山，土楼聚族。人与土地的长久协作，凝结成文化景观。',
    placeIds: ['suzhou', 'hongcun', 'fujian-tulou', 'honghe-terraces', 'west-lake', 'chengde'],
  },
].map((chapter, i) => ({ ...chapter, number: String(i + 1).padStart(2, '0') }));
