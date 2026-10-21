#!/usr/bin/env python3
"""Build the atlas's selected river centerlines from Natural Earth 1:10m.

Usage: python3 scripts/build-rivers.py [--source downloaded-source.geojson]
The source's vertices and separate components are retained. This is an
overview layer, not a hydrographic survey, river-bank polygon, or live channel.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path
from urllib.request import urlopen


SOURCE_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/"
    "geojson/ne_10m_rivers_lake_centerlines.geojson"
)
LICENSE_URL = "https://www.naturalearthdata.com/about/terms-of-use/"
PRECISION_NOTE = "1:1000万概括中心线，适于全国与区域概览；非河岸、实时河道、航道或测绘数据。"
SOURCE_LABEL = "Natural Earth · 1:10m rivers + lake centerlines · Public Domain"

# A source selector is its stable dissolve key and expected source name.
# Optional part/start/stop select existing vertices without interpolation.
# Splitting Chang Jiang at the exact Min confluence vertex preserves the
# established Chinese distinction between 金沙江 and 长江.
CHANG_JIANG = [
    ("18River", "Chang Jiang", 0),
    ("18River", "Chang Jiang", 1, 43, None),
    ("1River", "Yangtze"),
]
JINSHA = [("15River", "Jinsha"), ("18River", "Chang Jiang", 1, 0, 44)]

# id, Chinese map label, English name, display tier, basin, source selectors,
# introduction, optional source limitation. Display tiers are editorial, not
# hydrologic stream order or official river classifications.
RIVERS = [
    ("yangtze", "长江", "Yangtze", 1, "长江", CHANG_JIANG,
     "金沙江与岷江在宜宾汇合后称长江，向东串联四川盆地、三峡与长江中下游平原。沿江的港口、湿地与城市记录着水流塑造土地和生活的过程。",
     "源数据在宽阔水面与河口存在缺段，所示下游中心线未完整延伸至东海。"),
    ("jinsha", "金沙江", "Jinsha", 1, "长江", JINSHA,
     "长江上游在横断山区的重要河段，深切峡谷连接高原、山地与四川盆地。三江并流地区的金沙江与澜沧江、怒江大致平行南流。"),
    ("tongtian", "通天河", "Tongtian", 2, "长江", [("13River", "Tongtian")],
     "长江源区的重要干流河段，穿行青海高原，承接源区来水后向东南延续为金沙江。高寒草地、河谷湿地与冻土共同影响着这里的水文过程。"),
    ("tuotuo", "沱沱河", "Tuotuo", 3, "长江", [("11River", "Tuotuo")],
     "长江源区的代表性河流之一，发育于唐古拉山北侧的高寒环境。冰雪融水、降水和冻土变化共同参与源区的季节性水循环。",
     "仅收录源数据中沱沱河中下游的概括河段，未完整包含各拉丹冬冰川源头及上游。"),
    ("yellow-river", "黄河", "Yellow River", 1, "黄河", [("66River", "Huang"), ("66Lake Centerline", "Huang"), ("95River", "Huang")],
     "从青藏高原出发，黄河绕行河套、穿越黄土高原，最终流入渤海。泥沙搬运、河道摆动和长期治河，共同塑造了华北平原与沿河文明。",
     "含源区湖泊中心线；河口为源数据所记录的概括位置，不代表当前入海河道。"),
    ("heilongjiang", "黑龙江", "Heilong Jiang / Amur", 1, "黑龙江", [("93River", "Heilong Jiang"), ("72River", "Amur")],
     "额尔古纳河与石勒喀河汇合后形成黑龙江，沿中国东北边境东流。松花江、乌苏里江等汇入这一水系，滋养森林、平原与大面积湿地。",
     "保留源数据中俄罗斯境内的阿穆尔河下游；宽阔水面存在原始缺段。"),
    ("songhua", "松花江", "Songhua", 1, "黑龙江", [("366River", "Songhua")],
     "嫩江与第二松花江汇合后，松花江流经东北平原，最终汇入黑龙江。平缓河流、季节性结冰与沿岸湿地，构成东北地区鲜明的自然景观。"),
    ("second-songhua", "第二松花江", "Second Songhua", 2, "黑龙江", [("646River", "Di’er Songhua"), ("646Lake Centerline", "Di’er Songhua")],
     "发源于长白山地的松花江上游河段，流经吉林一带后与嫩江汇合。山地径流、库区与平原河谷连接起东北东部的水文与城市空间。"),
    ("nen", "嫩江", "Nen", 2, "黑龙江", [("940River", "Nen"), ("967River", "Di’er Songhua")],
     "从大兴安岭东侧向南流经松嫩平原，是松花江水系的重要支流。宽阔洪泛地与湿地，为水鸟和草原生态系统提供多样的栖息环境。",
     "源数据将嫩江下游至松花江汇合口的一段记作 Di’er Songhua；按其真实汇流位置归入嫩江，坐标原样保留。"),
    ("ussuri", "乌苏里江", "Ussuri", 2, "黑龙江", [("553River", "Ussuri"), ("611River", "Ussuri")],
     "沿中国东北边境向北注入黑龙江，连接森林山地与三江平原。丰富的河漫滩、支流和季节性洪水，使这里成为重要的湿地生态区域。",
     "含俄罗斯境内上游，源数据两段之间保留原有微小间隔。"),
    ("yalu", "鸭绿江", "Yalu", 2, "鸭绿江", [("680River", "Yalu"), ("680Lake Centerline", "Yalu")],
     "从长白山地区流向黄海，是中国与朝鲜之间的重要界河。峡谷、库区与入海平原依次展开，呈现东北山地向海岸过渡的地理层次。"),
    ("tumen", "图们江", "Tumen", 2, "图们江", [("1108River", "Tumen")],
     "发源于长白山地区，沿东北边境流向日本海。下游邻近中国、朝鲜与俄罗斯三国交界地带，山地、河谷与海岸在此紧密相接。"),
    ("ergun", "额尔古纳河", "Argun / Ergun", 2, "黑龙江", [("84River", "Argun’")],
     "黑龙江上源之一，沿中俄边境向北延伸，连接呼伦贝尔草原与北方森林。曲流和河谷湿地记录着水流在平缓地表上的长期作用。"),
    ("liao", "辽河", "Liao", 2, "辽河", [("246River", "Liao")],
     "辽河干流由东北内陆流向辽东湾，贯穿辽河平原。河口湿地、芦苇荡与冲积土地，连接着东北农业、工业城市与渤海海岸。"),
    ("xiliao", "西辽河", "West Liao", 3, "辽河", [("360River", "Xiliao")],
     "辽河上游的重要组成部分，向东流经内蒙古东部平原后与东辽河汇合。干旱与半干旱气候下，河流径流与区域用水密切相关。"),
    ("xar-moron", "西拉木伦河", "Xar Moron", 3, "辽河", [("310River", "Xar Moron")],
     "西辽河的重要上源，源自大兴安岭南段，穿过草原与沙地边缘。它与周边河谷共同构成认识中国北方农牧交错带的一条地理线索。"),
    ("hai", "海河", "Hai", 2, "海河", [("631River", "Hai")],
     "海河干流流经天津汇入渤海，承接华北多条河流的来水。城市河道、港口与河口湿地，展现出平原水系与人类长期治理的相互影响。",
     "仅表示海河干流；其上游各支流未全部收录。"),
    ("yongding", "永定河", "Yongding", 3, "海河", [("609River", "Yongding")],
     "桑干河与洋河汇合后称永定河，穿越北京西部山地进入华北平原。它的冲积、洪水与治理历史，是理解北京地理格局的重要线索。"),
    ("sanggan", "桑干河", "Sanggan", 3, "海河", [("422River", "Sanggan"), ("422Lake Centerline", "Sanggan")],
     "永定河的重要上源，流经山西北部与河北西北部的山间盆地。河谷沿线的农田、聚落与山口，连接着华北北缘的自然和人文空间。"),
    ("luan", "滦河", "Luan", 2, "滦河", [("908River", "Luan")],
     "由内蒙古高原进入燕山山地，再向南流入渤海。它将草原、峡谷、库区与海岸平原串联起来，也是京津冀区域的重要水源之一。"),
    ("huai", "淮河", "Huai", 2, "淮河", [("458River", "Huai"), ("419River", "Hudi", 1), ("419Lake Centerline", "Hudi", 0)],
     "流经河南、安徽和江苏的淮河，位于中国东部南北过渡地带。历史河道变迁与水利治理深刻改变了下游水系，洪泽湖是其中的重要节点。",
     "含洪泽湖概括中心线；入江水道另列。下游为受工程调控的复杂水系，不表示单一历史自然入海河道。"),
    ("huai-yangtze-waterway", "入江水道", "Huai–Yangtze Waterway", 3, "淮河", [("419River", "Hudi", 0), ("419River", "Hudi", 2), ("419Lake Centerline", "Hudi", 1)],
     "洪泽湖以下通向长江的重要泄洪通道，途经高邮湖等湖泊与河道。它体现了淮河下游以湖泊、闸坝和分洪通道共同调节来水的水利格局。",
     "受工程调控的水道与湖泊中心线，不代表完整淮河治理工程图。"),
    ("fujian-min", "闽江", "Min (Fujian)", 2, "闽江", [("473River", "Min")],
     "福建的代表性大河，由武夷山地等上游集水区流向福州与海岸。山地森林、盆地聚落和河口城市共同构成闽江流域的地理层次。",
     "源数据包含建溪方向的上游中心线，福州以下至海的河口段未完整收录。"),
    ("qiantang", "钱塘江", "Qiantang", 2, "钱塘江", [("385River", "Fuchun"), ("385Lake Centerline", "Fuchun")],
     "钱塘江水系连接皖南、浙西山地与杭州湾，上游新安江、富春江各具景观。河口喇叭形海湾与潮汐共同造就了著名的钱塘潮。",
     "所示为源数据的新安江—富春江—钱塘江部分中心线，未完整延伸至杭州湾；缩尺标注采用钱塘江水系名称。"),
    ("ou", "瓯江", "Ou", 3, "瓯江", [("886River", "Ou")],
     "从浙西南山地流向温州海岸，山间河谷与河口平原沿水相连。江心洲、丘陵与近海港口，展现浙江南部山海相接的地貌特征。"),
    ("jiulong", "九龙江", "Jiulong", 3, "九龙江", [("1085River", "Jiulong")],
     "闽南的重要河流，从福建西南部山地流向厦门湾。丘陵农业、河口冲积地与海湾聚落，沿水系形成联系紧密的山海空间。",
     "源数据仅收录部分干流，未表示完整北溪、西溪与河口分汊。"),
    ("xi", "西江", "Xi", 1, "珠江", [("96River", "Xi")],
     "浔江在梧州与桂江汇合后称西江，向东连接珠江三角洲。上游山地来水与三角洲分汊河道，共同支撑华南重要的水运和聚落网络。",
     "保留源数据所含的部分珠江三角洲分汊；不表示完整珠江口河网。"),
    ("xun", "浔江", "Xun", 2, "珠江", [("149River", "Xun")],
     "珠江水系西江干流的广西河段，承接黔江与郁江来水后流向梧州。河谷、盆地与沿江城镇，体现广西内陆连接珠江三角洲的水路格局。"),
    ("qian", "黔江", "Qian", 2, "珠江", [("148River", "Quan")],
     "红水河与柳江汇合后称黔江，至桂平与郁江汇合后延续为浔江。同一条水流沿途名称的改变，映照出珠江水系层层汇流的结构。"),
    ("hongshui", "红水河", "Hongshui", 2, "珠江", [("147River", "Hongshui")],
     "南盘江与北盘江汇合后形成红水河，是西江干流的重要河段。它穿行黔桂喀斯特山地，在深切河谷中连接高原边缘与广西盆地。"),
    ("nanpan", "南盘江", "Nanpan", 2, "珠江", [("128River", "Nanpan")],
     "珠江水系的重要上源，从云南东部流向黔桂交界地区。沿途高原、峡谷与喀斯特地貌，呈现中国西南山地向华南水系过渡的过程。"),
    ("bei", "北江", "Bei", 2, "珠江", [("552River", "Bei")],
     "北江从粤北山地流向珠江三角洲，与西江、东江共同构成珠江主要水系。山口、河谷和冲积平原让岭南内陆与海岸持续相连。"),
    ("dong", "东江", "Dong", 2, "珠江", [("539River", "Dong")],
     "东江由江西南部、广东东北部山地流向珠江三角洲东部。森林集水区、沿江城市与河口河网，使它成为华南重要的水源河流。"),
    ("yu", "郁江", "Yu", 2, "珠江", [("623River", "Yu")],
     "郁江向东流经广西盆地，在桂平与黔江汇合成为浔江。上游左江、右江与邕江连接边境山地和南宁盆地，构成西江水系的南部支干。"),
    ("yong", "邕江", "Yong", 3, "珠江", [("599River", "Yong")],
     "左江与右江在南宁附近汇合后形成邕江，向东延续为郁江。江水穿过城市与盆地，是南宁城市景观和区域水系的重要组成部分。"),
    ("liu", "柳江", "Liu", 3, "珠江", [("932River", "Liu")],
     "珠江水系的重要支流，流经柳州一带后汇入红水河—黔江干流。曲流、喀斯特孤峰与沿江城市，共同形成广西中部独特的河谷景观。",
     "源数据仅收录主要下游河段，上游融江另列。"),
    ("rong", "融江", "Rong", 3, "珠江", [("933River", "Rong")],
     "柳江上游的重要河段，穿过桂北山地与河谷盆地。沿江村寨、稻田和山地森林，体现西南丘陵地区顺应水系分布的聚落格局。"),
    ("xiang", "湘江", "Xiang", 2, "长江", [("457River", "Xiang")],
     "从湘桂交界山地向北流经湖南，最终进入洞庭湖水系。湘江串联永州、衡阳、株洲、湘潭与长沙等城市，是湖湘地域的重要地理轴线。"),
    ("yuan", "沅江", "Yuan", 2, "长江", [("247River", "Yuan"), ("247Lake Centerline", "Yuan")],
     "沅江从黔东南与湘西山地流向洞庭湖平原，连接森林峡谷、古镇与湖区湿地。它是观察湘黔山地自然环境与多样人文的一条水路。",
     "含源数据的洞庭湖部分湖泊中心线，湖区宽阔水面保留原有分段。"),
    ("gan", "赣江", "Gan", 2, "长江", [("278River", "Gan"), ("278Lake Centerline", "Gan")],
     "江西的主要河流，由赣南山地向北流经盆地和丘陵，汇入鄱阳湖。赣江水系与鄱阳湖共同构成江西连接长江的重要水文网络。",
     "含鄱阳湖概括中心线，不代表湖泊岸线与季节性水面。"),
    ("han", "汉江", "Han", 2, "长江", [("270River", "Han"), ("270Lake Centerline", "Han")],
     "发源于秦岭与大巴山之间的汉江，经汉中、襄阳等地，在武汉汇入长江。上游山间盆地与下游平原，记录着南北交通和水利利用的历史。"),
    ("jialing", "嘉陵江", "Jialing", 2, "长江", [("538River", "Jialing")],
     "嘉陵江从秦巴山地进入四川盆地，在重庆汇入长江。迂回曲流、峡谷与江岸城镇，展现地质构造、河流侵蚀和城市生长之间的关系。"),
    ("yalong", "雅砻江", "Yalong", 2, "长江", [("540River", "Yalong")],
     "从青藏高原东缘向南穿行川西山地，最终汇入金沙江。高寒草原、深切峡谷与山地森林沿海拔变化展开，形成显著的垂直景观带。"),
    ("dadu", "大渡河", "Dadu", 2, "长江", [("309River", "Dadu")],
     "大渡河从川西高原流向四川盆地西缘，在乐山附近汇入岷江。深切峡谷、强烈地形起伏与沿河通道，使它兼具自然和历史地理意义。"),
    ("sichuan-min", "岷江", "Min (Sichuan)", 2, "长江", [("367River", "Min")],
     "岷江是四川的重要河流，从川西北山地进入成都平原，再南下汇入长江。都江堰与平原灌溉体系，体现了人们长期适应河流的智慧。",
     "本层源数据仅含乐山附近至宜宾汇流口的岷江下游中心线，上游与都江堰附近未收录。"),
    ("wu", "乌江", "Wu", 2, "长江", [("456River", "Wu")],
     "乌江穿行贵州高原与重庆山地，汇入长江上游。喀斯特高原、陡峭峡谷与汇流河口，呈现西南地区河流深切地表的地貌过程。"),
    ("wei", "渭河", "Wei", 2, "黄河", [("873River", "Wei")],
     "黄河的重要支流，沿秦岭北麓向东流经关中平原。河流、黄土台塬与山前土地共同塑造了周秦汉唐都城及其农业腹地的地理条件。"),
    ("fen", "汾河", "Fen", 3, "黄河", [("1070River", "Fen")],
     "汾河自山西北部向南流经一系列断陷盆地，最终汇入黄河。沿线河谷、农业与古城，构成认识山西纵向地理格局的重要线索。"),
    ("jing", "泾河", "Jing", 3, "黄河", [("882River", "Jing")],
     "泾河穿行陇东黄土高原，在关中平原汇入渭河。流域内的黄土侵蚀、泥沙输送和水土保持，展示出土地利用与河流过程的紧密关系。"),
    ("lancang", "澜沧江", "Lancang / Mekong", 1, "澜沧江—湄公河", [("40River", "Lancang")],
     "澜沧江从青藏高原流经横断山地与云南，出境后称湄公河。高山峡谷、干热河谷与热带山地沿河相接，展现跨越纬度和海拔的自然变化。",
     "保留源数据延伸至境外的部分湄公河河段，未表示完整湄公河下游。"),
    ("za", "扎曲", "Za", 3, "澜沧江—湄公河", [("35River", "Za")],
     "澜沧江源区的重要上源，穿行青海高原南部的高寒草地与山间河谷。源区来水沿河向南，逐渐进入横断山地深切峡谷。"),
    ("nu", "怒江", "Nu / Salween", 1, "怒江—萨尔温江", [("134River", "Nu"), ("146River", "Nu")],
     "怒江自青藏高原向南穿过横断山地，与金沙江、澜沧江共同形成三江并流地区。深切峡谷与巨大的海拔落差，孕育多样的山地生态环境。",
     "含境外萨尔温江部分河段，未表示完整入海下游。"),
    ("yarlung-tsangpo", "雅鲁藏布江", "Yarlung Tsangpo", 1, "雅鲁藏布江—布拉马普特拉河", [("42River", "Yarlung"), ("47River", "Dihang")],
     "沿喜马拉雅山北侧向东流动，在南迦巴瓦峰附近形成著名大拐弯。河流从高原河谷进入湿润深切峡谷，展现青藏高原东南缘剧烈的地形变化。",
     "含大拐弯以下源数据名为 Dihang 的部分跨境河段，未表示完整布拉马普特拉河下游。"),
    ("maquan", "马泉河", "Maquan", 2, "雅鲁藏布江—布拉马普特拉河", [("31River", "Maquan")],
     "雅鲁藏布江上游的主要河段，沿喜马拉雅山北侧的高原宽谷向东流。高寒草地、冰雪来水和宽阔河谷共同构成藏西南的自然景观。"),
    ("red-river", "元江", "Yuan / Red River", 2, "元江—红河", [("306River", "Hong")],
     "元江从云南高原向东南流动，进入越南后称红河。深切河谷、干热气候与跨境下游平原，反映西南高原向中南半岛过渡的地理联系。",
     "保留源数据的越南境内红河河段；缩尺标注采用中国境内元江名称。"),
    ("tarim", "塔里木河", "Tarim", 1, "塔里木河", [("349River", "Tarim")],
     "由塔里木盆地周缘山地河流汇集而成，沿塔克拉玛干沙漠北缘向东流。冰雪融水、绿洲农业与胡杨河岸林，构成干旱区独特的生命走廊。",
     "源数据主要表示上中游概括中心线，未完整收录当前下游及生态输水通道。"),
    ("yarkant", "叶尔羌河", "Yarkant", 2, "塔里木河", [("242River", "Yarkant")],
     "发源于喀喇昆仑山地的叶尔羌河，为塔里木河提供重要来水。高山冰雪融水经过峡谷进入盆地，支撑山前绿洲与沙漠边缘的生态系统。"),
    ("aksu", "阿克苏河", "Aksu", 2, "塔里木河", [("947River", "Aksu")],
     "阿克苏河承接天山山地来水，是塔里木河的重要水源。山地积雪、冰川融水与季节性径流，通过河流维系盆地北缘的绿洲和河岸植被。",
     "主要表示托什干河与库玛拉克河汇合后的干流。"),
    ("ili", "伊犁河", "Ili", 2, "伊犁河", [("421River", "Ile"), ("421Lake Centerline", "Ile")],
     "伊犁河从天山西部山间谷地向西流入哈萨克斯坦，最终注入巴尔喀什湖。相对湿润的河谷、草原和山地森林，形成新疆西部鲜明的自然单元。",
     "保留哈萨克斯坦境内源数据河段，不表示完整支流与湖岸。"),
    ("irtysh", "额尔齐斯河", "Irtysh", 2, "额尔齐斯河—鄂毕河", [("30River", "Ertix"), ("29River", "Ertis"), ("29Lake Centerline", "Ertis")],
     "从阿尔泰山南麓向西北流出中国，经过哈萨克斯坦和俄罗斯，最终通过鄂毕河水系流向北冰洋。它展现中国西北山地与北方大陆水系的联系。",
     "含哈萨克斯坦境内部分干流和湖泊中心线，未表示完整额尔齐斯河及鄂毕河。"),
]


def select_parts(selector, by_key):
    key, expected_name, *selection = selector
    feature = by_key[key]
    assert feature["properties"]["name"] == expected_name, (key, expected_name)
    assert feature["geometry"]["type"] == "MultiLineString", key
    parts = feature["geometry"]["coordinates"]
    if selection:
        part, *vertex_range = selection
        parts = [parts[part]]
        if vertex_range:
            start, stop = vertex_range
            parts = [parts[0][start:stop]]
    return parts


def bbox_for(parts):
    points = [point for part in parts for point in part]
    return [min(p[0] for p in points), min(p[1] for p in points),
            max(p[0] for p in points), max(p[1] for p in points)]


def build(raw_source):
    source = json.loads(raw_source)
    by_key = {f["properties"]["dissolve"]: f for f in source["features"]}
    used_keys = {selector[0] for row in RIVERS for selector in row[5]}
    assert all(sum(f["properties"]["dissolve"] == key for f in source["features"]) == 1
               for key in used_keys), "Selected source dissolve keys must be unique"
    # These confluence vertices are shared by both original source features.
    assert by_key["18River"]["geometry"]["coordinates"][1][43] == [104.599294, 28.784369]
    assert by_key["367River"]["geometry"]["coordinates"][0][-1] == [104.599294, 28.784369]
    features = []
    for row in RIVERS:
        river_id, name, name_en, tier, basin, selectors, description, *notes = row
        parts = [part for selector in selectors for part in select_parts(selector, by_key)]
        assert len(parts) > 0 and all(len(part) >= 2 for part in parts), river_id
        assert all(len(p) == 2 and all(math.isfinite(v) for v in p)
                   and -180 <= p[0] <= 180 and -90 <= p[1] <= 90
                   for part in parts for p in part), river_id
        properties = {
            "id": river_id, "name": name, "name_en": name_en, "kind": "river",
            "tier": tier, "label": name, "basin": basin, "description": description,
            "source": SOURCE_URL, "source_name": SOURCE_LABEL,
            "precision_note": PRECISION_NOTE + (" " + notes[0] if notes else ""),
            "source_features": [{
                "dissolve": selector[0], "name": selector[1],
                "rivernum": by_key[selector[0]]["properties"]["rivernum"],
                "featurecla": by_key[selector[0]]["properties"]["featurecla"],
                **({"part": selector[2]} if len(selector) > 2 else {}),
                **({"vertex_start": selector[3], "vertex_stop_exclusive": selector[4]}
                   if len(selector) > 3 else {}),
            } for selector in selectors],
        }
        if river_id == "huai-yangtze-waterway":
            properties["waterway_type"] = "regulated-channel"
        features.append({"type": "Feature", "id": river_id, "bbox": bbox_for(parts),
                         "properties": properties,
                         "geometry": {"type": "MultiLineString", "coordinates": parts}})
    assert len(features) == 60 and len({f["id"] for f in features}) == 60
    assert len({f["properties"]["label"] for f in features}) == 60
    return {
        "type": "FeatureCollection",
        "name": "China selected river centerlines — Natural Earth 1:10m",
        "attribution": {
            "source": "Natural Earth, ne_10m_rivers_lake_centerlines",
            "source_url": SOURCE_URL,
            "source_sha256": hashlib.sha256(raw_source).hexdigest(),
            "license": "Public Domain", "license_url": LICENSE_URL,
            "coordinates": "WGS 84 longitude / latitude (OGC:CRS84)",
            "scale": "1:1000万", "precision_note": PRECISION_NOTE,
            "selection_note": "60条代表性河流与河段，并非完整中国河网。tier 为展示层级，不是水文分级。",
            "geometry_note": "保留源数据顶点、精度和分段；不补绘湖面、河口或断段，不计算或宣称实测长度。部分跨境河流保留境外延续。",
            "editing_note": "在源数据已有的宜宾岷江汇流顶点划分金沙江与长江；淮河与入江水道按源组件分列；源数据名为Di’er Songhua的嫩江下游段按真实汇流位置命名。",
            "label_note": "钱塘江、元江等标签采用缩尺水系名称；具体源段与跨境范围见各要素说明。",
        },
        "bbox": bbox_for([part for f in features for part in f["geometry"]["coordinates"]]),
        "features": features,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, help="Previously downloaded Natural Earth GeoJSON")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "public/data/rivers.geojson")
    args = parser.parse_args()
    raw_source = args.source.read_bytes() if args.source else urlopen(SOURCE_URL, timeout=60).read()
    collection = build(raw_source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(collection, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"Wrote {len(collection['features'])} rivers to {args.output}")
    print(f"Source SHA256: {collection['attribution']['source_sha256']}")
    print(f"BBox: {collection['bbox']}")


if __name__ == "__main__":
    main()
