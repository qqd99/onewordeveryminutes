"""Build the assistant-authored vocabulary layer from the translations below.

These translations were authored in this Codex conversation on 2026-11-09.
They have not undergone independent human review. The user authorized direct
use. This script formats the authored text and makes no translation requests.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / "web" / "dictionary"

# Each group contains ten specific noun concepts, in the same order as every
# language's ten-term lines. Source IDs identify senses, not translated glosses.
CONCEPTS = """
1-310 water|1-810 fire|1-520 sun|1-530 moon|1-540 star|1-510 sky|1-750 rain (noun)|1-760 snow (noun)|1-720 wind|1-730 cloud
1-220 mountain, hill|1-360 river, stream, brook|1-320 sea|1-330 lake|1-440 stone, rock|1-215 sand|8-600 tree|8-560 leaf|8-540 root|8-570 flower
8-311 seed|8-510 grass|1-430 wood|5-710 fruit|5-120 food|5-510 bread|5-610 meat|5-810 salt|5-860 milk (noun)|5-970 egg
2-350 father|2-360 mother|2-440 brother|2-450 sister|2-270 child|2-220 woman|3-610 dog|3-620 cat|3-581 bird|3-650 fish
3-410 horse (equine)|3-230 cow|3-250 sheep|3-360 goat|3-350 pig|4-200 head|4-210 eye|4-220 ear|4-230 nose|4-240 mouth
4-270 tooth|4-260 tongue|4-330 hand|4-370 foot|4-440 heart|4-150 blood|4-160 bone|4-120 skin, hide|4-140 hair (head)|7-120 house
7-220 door, gate|7-250 window|7-270 wall|7-510 roof|7-420 bed|7-430 chair|7-440 table|17-280 school|18-610 book|18-280 name
14-410 day|14-420 night|14-730 year|10-710 road|10-740 bridge|10-830 boat|9-230 knife|6-360 needle|9-190 rope, cord|11-430 money
"""

# A semicolon separates alternative words for one concept. Head hair, the
# anatomical tongue/heart, wood as material and a female bovine are intended.
LANGUAGES = {
    "en": ("English", """
water|fire|sun|moon|star|sky|rain|snow|wind|cloud
mountain; hill|river; stream|sea|lake|stone; rock|sand|tree|leaf|root|flower
seed|grass|wood|fruit|food|bread|meat|salt|milk|egg
father|mother|brother|sister|child|woman|dog|cat|bird|fish
horse|cow|sheep|goat|pig|head|eye|ear|nose|mouth
tooth|tongue|hand|foot|heart|blood|bone|skin|hair|house
door; gate|window|wall|roof|bed|chair|table|school|book|name
day|night|year|road|bridge|boat|knife|needle|rope; cord|money
"""),
    "vi": ("Vietnamese", """
nước|lửa|mặt trời|mặt trăng|ngôi sao|bầu trời|mưa|tuyết|gió|đám mây
núi; đồi|sông; suối|biển|hồ|đá|cát|cây|lá|rễ|hoa
hạt giống|cỏ|gỗ|trái cây; quả|thức ăn|bánh mì|thịt|muối|sữa|trứng
cha; bố|mẹ|anh trai; em trai|chị gái; em gái|trẻ em; đứa trẻ|phụ nữ|chó|mèo|chim|cá
ngựa|bò cái|cừu|dê|lợn; heo|đầu|mắt|tai|mũi|miệng
răng|lưỡi|bàn tay|bàn chân|tim|máu|xương|da|tóc|nhà
cửa; cổng|cửa sổ|tường|mái nhà|giường|ghế|bàn|trường học|sách|tên
ngày|đêm|năm|đường|cầu|thuyền|dao|kim|dây thừng; dây|tiền
"""),
    "it": ("Italian", """
acqua|fuoco|sole|luna|stella|cielo|pioggia|neve|vento|nuvola
montagna; collina|fiume; ruscello|mare|lago|pietra; roccia|sabbia|albero|foglia|radice|fiore
seme|erba|legno|frutta|cibo|pane|carne|sale|latte|uovo
padre|madre|fratello|sorella|bambino; bambina|donna|cane|gatto|uccello|pesce
cavallo|mucca|pecora|capra|maiale|testa|occhio|orecchio|naso|bocca
dente|lingua|mano|piede|cuore|sangue|osso|pelle|capelli|casa
porta; cancello|finestra|muro; parete|tetto|letto|sedia|tavolo|scuola|libro|nome
giorno|notte|anno|strada|ponte|barca|coltello|ago|corda|denaro; soldi
"""),
    "es": ("Spanish", """
agua|fuego|sol|luna|estrella|cielo|lluvia|nieve|viento|nube
montaña; colina|río; arroyo|mar|lago|piedra; roca|arena|árbol|hoja|raíz|flor
semilla|hierba|madera|fruta|comida; alimento|pan|carne|sal|leche|huevo
padre|madre|hermano|hermana|niño; niña|mujer|perro|gato|pájaro; ave|pez
caballo|vaca|oveja|cabra|cerdo|cabeza|ojo|oreja|nariz|boca
diente|lengua|mano|pie|corazón|sangre|hueso|piel|cabello; pelo|casa
puerta; portón|ventana|pared; muro|techo; tejado|cama|silla|mesa|escuela|libro|nombre
día|noche|año|camino; carretera|puente|barco; bote|cuchillo|aguja|cuerda|dinero
"""),
    "fr": ("French", """
eau|feu|soleil|lune|étoile|ciel|pluie|neige|vent|nuage
montagne; colline|rivière; fleuve; ruisseau|mer|lac|pierre; roche|sable|arbre|feuille|racine|fleur
graine|herbe|bois|fruit|nourriture|pain|viande|sel|lait|œuf
père|mère|frère|sœur|enfant|femme|chien|chat|oiseau|poisson
cheval|vache|mouton|chèvre|cochon; porc|tête|œil|oreille|nez|bouche
dent|langue|main|pied|cœur|sang|os|peau|cheveux|maison
porte; portail|fenêtre|mur|toit|lit|chaise|table|école|livre|nom
jour|nuit|année; an|route; chemin|pont|bateau|couteau|aiguille|corde|argent
"""),
    "de": ("German", """
Wasser|Feuer|Sonne|Mond|Stern|Himmel|Regen|Schnee|Wind|Wolke
Berg; Hügel|Fluss; Bach|Meer|See|Stein; Fels|Sand|Baum|Blatt|Wurzel|Blume; Blüte
Samen|Gras|Holz|Obst; Frucht|Essen; Nahrung|Brot|Fleisch|Salz|Milch|Ei
Vater|Mutter|Bruder|Schwester|Kind|Frau|Hund|Katze|Vogel|Fisch
Pferd|Kuh|Schaf|Ziege|Schwein|Kopf|Auge|Ohr|Nase|Mund
Zahn|Zunge|Hand|Fuß|Herz|Blut|Knochen|Haut|Haar; Haare|Haus
Tür; Tor|Fenster|Wand; Mauer|Dach|Bett|Stuhl|Tisch|Schule|Buch|Name
Tag|Nacht|Jahr|Straße; Weg|Brücke|Boot|Messer|Nadel|Seil; Schnur|Geld
"""),
    "pt": ("Portuguese", """
água|fogo|sol|lua|estrela|céu|chuva|neve|vento|nuvem
montanha; colina|rio; riacho|mar|lago|pedra; rocha|areia|árvore|folha|raiz|flor
semente|grama; erva|madeira|fruta|comida; alimento|pão|carne|sal|leite|ovo
pai|mãe|irmão|irmã|criança|mulher|cão; cachorro|gato|pássaro; ave|peixe
cavalo|vaca|ovelha|cabra|porco|cabeça|olho|orelha|nariz|boca
dente|língua|mão|pé|coração|sangue|osso|pele|cabelo|casa
porta; portão|janela|parede; muro|telhado|cama|cadeira|mesa|escola|livro|nome
dia|noite|ano|estrada; caminho|ponte|barco|faca|agulha|corda|dinheiro
"""),
    "nl": ("Dutch", """
water|vuur|zon|maan|ster|hemel|regen|sneeuw|wind|wolk
berg; heuvel|rivier; beek|zee|meer|steen; rots|zand|boom|blad|wortel|bloem
zaad|gras|hout|fruit; vrucht|voedsel; eten|brood|vlees|zout|melk|ei
vader|moeder|broer|zus|kind|vrouw|hond|kat|vogel|vis
paard|koe|schaap|geit|varken|hoofd|oog|oor|neus|mond
tand|tong|hand|voet|hart|bloed|bot|huid|haar|huis
deur; poort|raam|muur; wand|dak|bed|stoel|tafel|school|boek|naam
dag|nacht|jaar|weg|brug|boot|mes|naald|touw; koord|geld
"""),
    "sv": ("Swedish", """
vatten|eld|sol|måne|stjärna|himmel|regn|snö|vind|moln
berg; kulle|flod; å; bäck|hav|sjö|sten; klippa|sand|träd|löv; blad|rot|blomma
frö|gräs|trä|frukt|mat|bröd|kött|salt|mjölk|ägg
far; pappa|mor; mamma|bror|syster|barn|kvinna|hund|katt|fågel|fisk
häst|ko|får|get|gris|huvud|öga|öra|näsa|mun
tand|tunga|hand|fot|hjärta|blod|ben|hud|hår|hus
dörr; grind|fönster|vägg; mur|tak|säng|stol|bord|skola|bok|namn
dag|natt|år|väg|bro|båt|kniv|nål|rep; snöre|pengar
"""),
    "nb": ("Norwegian Bokmål", """
vann|ild|sol|måne|stjerne|himmel|regn|snø|vind|sky
fjell; ås|elv; bekk|hav; sjø|innsjø|stein; klippe|sand|tre|blad; løv|rot|blomst
frø|gress|tre; ved|frukt|mat|brød|kjøtt|salt|melk|egg
far; pappa|mor; mamma|bror|søster|barn|kvinne|hund|katt|fugl|fisk
hest|ku|sau|geit|gris|hode|øye|øre|nese|munn
tann|tunge|hånd|fot|hjerte|blod|bein; knokkel|hud|hår|hus
dør; port|vindu|vegg; mur|tak|seng|stol|bord|skole|bok|navn
dag|natt|år|vei|bro|båt|kniv|nål|tau; snor|penger
"""),
    "da": ("Danish", """
vand|ild|sol|måne|stjerne|himmel|regn|sne|vind|sky
bjerg; bakke|flod; å; bæk|hav|sø|sten; klippe|sand|træ|blad|rod|blomst
frø|græs|træ|frugt|mad|brød|kød|salt|mælk|æg
far; fader|mor; moder|bror|søster|barn|kvinde|hund|kat|fugl|fisk
hest|ko|får|ged|gris|hoved|øje|øre|næse|mund
tand|tunge|hånd|fod|hjerte|blod|knogle|hud|hår|hus
dør; port|vindue|væg; mur|tag|seng|stol|bord|skole|bog|navn
dag|nat|år|vej|bro|båd|kniv|nål|reb; snor|penge
"""),
    "fi": ("Finnish", """
vesi|tuli|aurinko|kuu|tähti|taivas|sade|lumi|tuuli|pilvi
vuori; mäki|joki; puro|meri|järvi|kivi; kallio|hiekka|puu|lehti|juuri|kukka
siemen|ruoho|puu; puutavara|hedelmä|ruoka|leipä|liha|suola|maito|muna
isä|äiti|veli|sisko; sisar|lapsi|nainen|koira|kissa|lintu|kala
hevonen|lehmä|lammas|vuohi|sika|pää|silmä|korva|nenä|suu
hammas|kieli|käsi|jalkaterä|sydän|veri|luu|iho|hiukset|talo
ovi; portti|ikkuna|seinä; muuri|katto|sänky; vuode|tuoli|pöytä|koulu|kirja|nimi
päivä|yö|vuosi|tie|silta|vene|veitsi|neula|köysi; naru|raha
"""),
    "pl": ("Polish", """
woda|ogień|słońce|księżyc|gwiazda|niebo|deszcz|śnieg|wiatr|chmura
góra; wzgórze|rzeka; strumień|morze|jezioro|kamień; skała|piasek|drzewo|liść|korzeń|kwiat
nasiono|trawa|drewno|owoc|jedzenie; żywność|chleb|mięso|sól|mleko|jajko
ojciec|matka|brat|siostra|dziecko|kobieta|pies|kot|ptak|ryba
koń|krowa|owca|koza|świnia|głowa|oko|ucho|nos|usta
ząb|język|dłoń; ręka|stopa|serce|krew|kość|skóra|włosy|dom
drzwi; brama|okno|ściana; mur|dach|łóżko|krzesło|stół|szkoła|książka|imię; nazwa
dzień|noc|rok|droga|most|łódź|nóż|igła|lina; sznur|pieniądze
"""),
    "cs": ("Czech", """
voda|oheň|slunce|měsíc|hvězda|nebe; obloha|déšť|sníh|vítr|mrak; oblak
hora; kopec|řeka; potok|moře|jezero|kámen; skála|písek|strom|list|kořen|květina; květ
semeno|tráva|dřevo|ovoce; plod|jídlo; potrava|chléb|maso|sůl|mléko|vejce
otec|matka|bratr|sestra|dítě|žena|pes|kočka|pták|ryba
kůň|kráva|ovce|koza|prase|hlava|oko|ucho|nos|ústa
zub|jazyk|ruka; dlaň|chodidlo|srdce|krev|kost|kůže|vlasy|dům
dveře; brána|okno|zeď; stěna|střecha|postel|židle|stůl|škola|kniha|jméno; název
den|noc|rok|silnice; cesta|most|loď; člun|nůž|jehla|lano; provaz|peníze
"""),
    "sk": ("Slovak", """
voda|oheň|slnko|mesiac|hviezda|nebo; obloha|dážď|sneh|vietor|oblak; mrak
hora; kopec|rieka; potok|more|jazero|kameň; skala|piesok|strom|list|koreň|kvet
semeno|tráva|drevo|ovocie; plod|jedlo; potrava|chlieb|mäso|soľ|mlieko|vajce
otec|matka|brat|sestra|dieťa|žena|pes|mačka|vták|ryba
kôň|krava|ovca|koza|prasa|hlava|oko|ucho|nos|ústa
zub|jazyk|ruka; dlaň|chodidlo|srdce|krv|kosť|koža|vlasy|dom
dvere; brána|okno|stena; múr|strecha|posteľ|stolička|stôl|škola|kniha|meno; názov
deň|noc|rok|cesta|most|loď; čln|nôž|ihla|lano; povraz|peniaze
"""),
    "hu": ("Hungarian", """
víz|tűz|nap|hold|csillag|ég|eső|hó|szél|felhő
hegy; domb|folyó; patak|tenger|tó|kő; szikla|homok|fa|levél|gyökér|virág
mag|fű|fa; faanyag|gyümölcs|étel; élelem|kenyér|hús|só|tej|tojás
apa|anya|fiútestvér; fivér|lánytestvér; nővér; húg|gyermek; gyerek|nő|kutya|macska|madár|hal
ló|tehén|juh; birka|kecske|disznó; sertés|fej|szem|fül|orr|száj
fog|nyelv|kéz|lábfej|szív|vér|csont|bőr|haj|ház
ajtó; kapu|ablak|fal|tető|ágy|szék|asztal|iskola|könyv|név
nap|éjszaka|év|út|híd|csónak; hajó|kés|tű|kötél; zsinór|pénz
"""),
    "ro": ("Romanian", """
apă|foc|soare|lună|stea|cer|ploaie|zăpadă|vânt|nor
munte; deal|râu; pârâu|mare|lac|piatră; stâncă|nisip|copac|frunză|rădăcină|floare
sămânță|iarbă|lemn|fruct|mâncare; hrană|pâine|carne|sare|lapte|ou
tată|mamă|frate|soră|copil|femeie|câine|pisică|pasăre|pește
cal|vacă|oaie|capră|porc|cap|ochi|ureche|nas|gură
dinte|limbă|mână|laba piciorului|inimă|sânge|os|piele|păr|casă
ușă; poartă|fereastră|perete; zid|acoperiș|pat|scaun|masă|școală|carte|nume
zi|noapte|an|drum; șosea|pod|barcă|cuțit|ac|frânghie; sfoară|bani
"""),
    "el": ("Greek", """
νερό|φωτιά|ήλιος|φεγγάρι; σελήνη|αστέρι|ουρανός|βροχή|χιόνι|άνεμος|σύννεφο
βουνό; λόφος|ποτάμι; ρυάκι|θάλασσα|λίμνη|πέτρα; βράχος|άμμος|δέντρο|φύλλο|ρίζα|λουλούδι
σπόρος|χορτάρι|ξύλο|φρούτο; καρπός|φαγητό; τροφή|ψωμί|κρέας|αλάτι|γάλα|αυγό
πατέρας|μητέρα|αδελφός|αδελφή|παιδί|γυναίκα|σκύλος|γάτα|πουλί|ψάρι
άλογο|αγελάδα|πρόβατο|κατσίκα|γουρούνι|κεφάλι|μάτι|αυτί|μύτη|στόμα
δόντι|γλώσσα|χέρι|πέλμα|καρδιά|αίμα|κόκαλο; οστό|δέρμα|μαλλιά|σπίτι
πόρτα; πύλη|παράθυρο|τοίχος|στέγη|κρεβάτι|καρέκλα|τραπέζι|σχολείο|βιβλίο|όνομα
ημέρα; μέρα|νύχτα|έτος; χρόνος|δρόμος|γέφυρα|βάρκα|μαχαίρι|βελόνα|σχοινί|χρήματα
"""),
    "ru": ("Russian", """
вода|огонь|солнце|луна|звезда|небо|дождь|снег|ветер|облако
гора; холм|река; ручей|море|озеро|камень; скала|песок|дерево|лист|корень|цветок
семя|трава|древесина|фрукт; плод|еда; пища|хлеб|мясо|соль|молоко|яйцо
отец|мать|брат|сестра|ребёнок|женщина|собака|кошка|птица|рыба
лошадь|корова|овца|коза|свинья|голова|глаз|ухо|нос|рот
зуб|язык|кисть; рука|ступня|сердце|кровь|кость|кожа|волосы|дом
дверь; ворота|окно|стена|крыша|кровать|стул|стол|школа|книга|имя; название
день|ночь|год|дорога|мост|лодка|нож|игла|верёвка; шнур|деньги
"""),
    "uk": ("Ukrainian", """
вода|вогонь|сонце|місяць|зірка|небо|дощ|сніг|вітер|хмара
гора; пагорб|річка; струмок|море|озеро|камінь; скеля|пісок|дерево|листок|корінь|квітка
насінина; насіння|трава|деревина|фрукт; плід|їжа|хліб|м'ясо|сіль|молоко|яйце
батько|мати|брат|сестра|дитина|жінка|собака|кішка|птах|риба
кінь|корова|вівця|коза|свиня|голова|око|вухо|ніс|рот
зуб|язик|кисть; рука|ступня|серце|кров|кістка|шкіра|волосся|будинок; хата
двері; ворота|вікно|стіна|дах|ліжко|стілець|стіл|школа|книга|ім'я; назва
день|ніч|рік|дорога|міст|човен|ніж|голка|мотузка; шнур|гроші
"""),
    "bg": ("Bulgarian", """
вода|огън|слънце|луна|звезда|небе|дъжд|сняг|вятър|облак
планина; хълм|река; поток|море|езеро|камък; скала|пясък|дърво|лист|корен|цвете
семе|трева|дървесина|плод|храна|хляб|месо|сол|мляко|яйце
баща|майка|брат|сестра|дете|жена|куче|котка|птица|риба
кон|крава|овца|коза|прасе|глава|око|ухо|нос|уста
зъб|език|ръка; длан|стъпало|сърце|кръв|кост|кожа|коса|къща
врата; порта|прозорец|стена|покрив|легло|стол|маса|училище|книга|име
ден|нощ|година|път|мост|лодка|нож|игла|въже; връв|пари
"""),
    "sr": ("Serbian", """
вода|ватра|сунце|месец|звезда|небо|киша|снег|ветар|облак
планина; брдо|река; поток|море|језеро|камен; стена|песак|дрво|лист|корен|цвет
семе|трава|дрво; дрвна грађа|воће; плод|храна|хлеб|месо|со|млеко|јаје
отац|мајка|брат|сестра|дете|жена|пас|мачка|птица|риба
коњ|крава|овца|коза|свиња|глава|око|ухо|нос|уста
зуб|језик|шака; рука|стопало|срце|крв|кост|кожа|коса|кућа
врата; капија|прозор|зид|кров|кревет|столица|сто|школа|књига|име
дан|ноћ|година|пут|мост|чамац|нож|игла|конопац; уже|новац
"""),
    "hr": ("Croatian", """
voda|vatra|sunce|mjesec|zvijezda|nebo|kiša|snijeg|vjetar|oblak
planina; brdo|rijeka; potok|more|jezero|kamen; stijena|pijesak|drvo|list|korijen|cvijet
sjeme|trava|drvo; drvna građa|voće; plod|hrana|kruh|meso|sol|mlijeko|jaje
otac|majka|brat|sestra|dijete|žena|pas|mačka|ptica|riba
konj|krava|ovca|koza|svinja|glava|oko|uho|nos|usta
zub|jezik|šaka; ruka|stopalo|srce|krv|kost|koža|kosa|kuća
vrata; kapija|prozor|zid|krov|krevet|stolica|stol|škola|knjiga|ime
dan|noć|godina|cesta; put|most|čamac|nož|igla|uže; konopac|novac
"""),
    "tr": ("Turkish", """
su|ateş|güneş|ay|yıldız|gökyüzü|yağmur|kar|rüzgâr|bulut
dağ; tepe|nehir; dere|deniz|göl|taş; kaya|kum|ağaç|yaprak|kök|çiçek
tohum|ot; çimen|odun; ahşap|meyve|yemek; yiyecek|ekmek|et|tuz|süt|yumurta
baba|anne|erkek kardeş|kız kardeş|çocuk|kadın|köpek|kedi|kuş|balık
at|inek|koyun|keçi|domuz|baş; kafa|göz|kulak|burun|ağız
diş|dil|el|ayak|kalp; yürek|kan|kemik|deri|saç|ev
kapı|pencere|duvar|çatı|yatak|sandalye|masa|okul|kitap|isim; ad
gün|gece|yıl; sene|yol|köprü|tekne; kayık|bıçak|iğne|ip; halat|para
"""),
    "ar": ("Arabic (Modern Standard)", """
ماء|نار|شمس|قمر|نجم|سماء|مطر|ثلج|ريح|سحابة
جبل; تل|نهر; جدول|بحر|بحيرة|حجر; صخر|رمل|شجرة|ورقة|جذر|زهرة
بذرة|عشب|خشب|فاكهة; ثمرة|طعام; غذاء|خبز|لحم|ملح|حليب|بيضة
أب|أم|أخ|أخت|طفل; طفلة|امرأة|كلب|قطة|طائر|سمكة
حصان|بقرة|خروف; شاة|ماعز|خنزير|رأس|عين|أذن|أنف|فم
سن|لسان|يد|قدم|قلب|دم|عظم|جلد|شعر|بيت; منزل
باب; بوابة|نافذة|جدار|سقف|سرير|كرسي|طاولة|مدرسة|كتاب|اسم
يوم|ليل|سنة; عام|طريق|جسر|قارب|سكين|إبرة|حبل|مال; نقود
"""),
    "he": ("Hebrew", """
מים|אש|שמש|ירח|כוכב|שמיים|גשם|שלג|רוח|ענן
הר; גבעה|נהר; נחל|ים|אגם|אבן; סלע|חול|עץ|עלה|שורש|פרח
זרע|דשא; עשב|עץ|פרי|אוכל; מזון|לחם|בשר|מלח|חלב|ביצה
אב; אבא|אם; אמא|אח|אחות|ילד; ילדה|אישה|כלב|חתול|ציפור|דג
סוס|פרה|כבש|עז|חזיר|ראש|עין|אוזן|אף|פה
שן|לשון|יד; כף יד|כף רגל|לב|דם|עצם|עור|שיער|בית
דלת; שער|חלון|קיר|גג|מיטה|כיסא|שולחן|בית ספר|ספר|שם
יום|לילה|שנה|דרך; כביש|גשר|סירה|סכין|מחט|חבל|כסף
"""),
    "fa": ("Persian", """
آب|آتش|خورشید|ماه|ستاره|آسمان|باران|برف|باد|ابر
کوه; تپه|رود; رودخانه; جویبار|دریا|دریاچه|سنگ; صخره|ماسه; شن|درخت|برگ|ریشه|گل
دانه; بذر|علف; چمن|چوب|میوه|غذا; خوراک|نان|گوشت|نمک|شیر|تخم‌مرغ
پدر|مادر|برادر|خواهر|کودک; بچه|زن|سگ|گربه|پرنده|ماهی
اسب|گاو ماده|گوسفند|بز|خوک|سر|چشم|گوش|بینی|دهان
دندان|زبان|دست|کف پا|قلب; دل|خون|استخوان|پوست|مو|خانه
در; دروازه|پنجره|دیوار|بام; سقف|تختخواب|صندلی|میز|مدرسه|کتاب|نام; اسم
روز|شب|سال|راه; جاده|پل|قایق|چاقو|سوزن|طناب; ریسمان|پول
"""),
    "hi": ("Hindi", """
पानी; जल|आग|सूरज; सूर्य|चाँद; चंद्रमा|तारा|आकाश; आसमान|बारिश; वर्षा|बर्फ़|हवा|बादल
पहाड़; पहाड़ी|नदी; नाला|समुद्र|झील|पत्थर; चट्टान|रेत|पेड़|पत्ता|जड़|फूल
बीज|घास|लकड़ी|फल|खाना; भोजन|रोटी; डबलरोटी|मांस|नमक|दूध|अंडा
पिता|माता; माँ|भाई|बहन|बच्चा; बच्ची|औरत; महिला|कुत्ता|बिल्ली|पक्षी; चिड़िया|मछली
घोड़ा|गाय|भेड़|बकरी|सूअर|सिर|आँख|कान|नाक|मुँह
दाँत|जीभ|हाथ|पाँव; पैर|दिल; हृदय|खून; रक्त|हड्डी|त्वचा; चमड़ी|बाल|घर
दरवाज़ा; फाटक|खिड़की|दीवार|छत|बिस्तर; पलंग|कुर्सी|मेज़|विद्यालय; स्कूल|किताब; पुस्तक|नाम
दिन|रात|साल; वर्ष|सड़क; रास्ता|पुल|नाव|चाकू|सुई|रस्सी|पैसा; धन
"""),
    "bn": ("Bengali", """
পানি; জল|আগুন|সূর্য|চাঁদ|তারা|আকাশ|বৃষ্টি|তুষার|বাতাস; হাওয়া|মেঘ
পাহাড়; টিলা|নদী|সমুদ্র|হ্রদ|পাথর|বালি|গাছ|পাতা|শিকড়|ফুল
বীজ|ঘাস|কাঠ|ফল|খাবার; খাদ্য|রুটি; পাউরুটি|মাংস|লবণ; নুন|দুধ|ডিম
বাবা; পিতা|মা; মাতা|ভাই|বোন|শিশু|নারী; মহিলা|কুকুর|বিড়াল|পাখি|মাছ
ঘোড়া|গাভী|ভেড়া|ছাগল|শূকর|মাথা|চোখ|কান|নাক|মুখ
দাঁত|জিভ; জিহ্বা|হাত|পা|হৃদয়; হৃৎপিণ্ড|রক্ত|হাড়|ত্বক; চামড়া|চুল|বাড়ি; ঘর
দরজা; ফটক|জানালা|দেয়াল|ছাদ|বিছানা; খাট|চেয়ার|টেবিল|বিদ্যালয়; স্কুল|বই|নাম
দিন|রাত|বছর|রাস্তা; পথ|সেতু; পুল|নৌকা|ছুরি|সুই; সূচ|দড়ি|টাকা; অর্থ
"""),
    "ur": ("Urdu", """
پانی|آگ|سورج|چاند|تارا; ستارہ|آسمان|بارش|برف|ہوا|بادل
پہاڑ; پہاڑی|دریا; ندی|سمندر|جھیل|پتھر; چٹان|ریت|درخت|پتّا|جڑ|پھول
بیج|گھاس|لکڑی|پھل|کھانا; غذا|روٹی; ڈبل روٹی|گوشت|نمک|دودھ|انڈا
باپ; والد|ماں; والدہ|بھائی|بہن|بچہ; بچی|عورت|کتا|بلی|پرندہ|مچھلی
گھوڑا|گائے|بھیڑ|بکری|سور|سر|آنکھ|کان|ناک|منہ
دانت|زبان|ہاتھ|پاؤں|دل|خون|ہڈی|جلد; کھال|بال|گھر
دروازہ; پھاٹک|کھڑکی|دیوار|چھت|بستر; پلنگ|کرسی|میز|مدرسہ; اسکول|کتاب|نام
دن|رات|سال|سڑک; راستہ|پل|کشتی|چاقو; چھری|سوئی|رسی|پیسہ; رقم
"""),
    "zh-CN": ("Chinese (Mandarin)", """
水|火|太阳|月亮|星星|天空|雨|雪|风|云
山; 丘陵|河; 溪流|海|湖|石头; 岩石|沙子|树|叶子|根|花
种子|草|木材; 木头|水果; 果实|食物|面包|肉|盐|牛奶|蛋
父亲; 爸爸|母亲; 妈妈|哥哥; 弟弟|姐姐; 妹妹|孩子; 儿童|女人; 妇女|狗|猫|鸟|鱼
马|母牛|绵羊|山羊|猪|头|眼睛|耳朵|鼻子|嘴
牙齿|舌头|手|脚|心脏|血|骨头|皮肤|头发|房子
门; 大门|窗户|墙|屋顶|床|椅子|桌子|学校|书|名字; 名称
白天; 日|夜晚|年|路; 道路|桥|船|刀|针|绳子|钱
"""),
    "zh-TW": ("Chinese (Mandarin, traditional script)", """
水|火|太陽|月亮|星星|天空|雨|雪|風|雲
山; 丘陵|河; 溪流|海|湖|石頭; 岩石|沙子|樹|葉子|根|花
種子|草|木材; 木頭|水果; 果實|食物|麵包|肉|鹽|牛奶|蛋
父親; 爸爸|母親; 媽媽|哥哥; 弟弟|姐姐; 妹妹|孩子; 兒童|女人; 婦女|狗|貓|鳥|魚
馬|母牛|綿羊|山羊|豬|頭|眼睛|耳朵|鼻子|嘴
牙齒|舌頭|手|腳|心臟|血|骨頭|皮膚|頭髮|房子
門; 大門|窗戶|牆|屋頂|床|椅子|桌子|學校|書|名字; 名稱
白天; 日|夜晚|年|路; 道路|橋|船|刀|針|繩子|錢
"""),
    "ja": ("Japanese", """
水|火|太陽|月|星|空|雨|雪|風|雲
山; 丘|川; 小川|海|湖|石; 岩|砂|木|葉|根|花
種|草|木材|果物; 果実|食べ物|パン|肉|塩|牛乳|卵
父; お父さん|母; お母さん|兄; 弟|姉; 妹|子供|女性; 女|犬|猫|鳥|魚
馬|雌牛|羊|山羊|豚|頭|目|耳|鼻|口
歯|舌|手|足|心臓|血|骨|皮膚|髪|家
ドア; 戸; 門|窓|壁|屋根|ベッド; 寝床|椅子|テーブル|学校|本|名前
日; 昼|夜|年|道; 道路|橋|舟; 船|ナイフ; 包丁|針|縄; ロープ|お金
"""),
    "ko": ("Korean", """
물|불|해; 태양|달|별|하늘|비|눈|바람|구름
산; 언덕|강; 개울|바다|호수|돌; 바위|모래|나무|잎|뿌리|꽃
씨앗|풀|목재|과일; 열매|음식|빵|고기|소금|우유|알; 달걀
아버지|어머니|형; 오빠; 남동생|누나; 언니; 여동생|아이; 어린이|여자; 여성|개|고양이|새|물고기
말|암소|양|염소|돼지|머리|눈|귀|코|입
이; 치아|혀|손|발|심장|피|뼈|피부|머리카락|집
문; 대문|창문|벽|지붕|침대; 잠자리|의자|탁자; 테이블|학교|책|이름
날; 낮|밤|해; 년|길; 도로|다리|배|칼|바늘|밧줄; 끈|돈
"""),
    "th": ("Thai", """
น้ำ|ไฟ|ดวงอาทิตย์|ดวงจันทร์|ดาว|ท้องฟ้า|ฝน|หิมะ|ลม|เมฆ
ภูเขา; เนินเขา|แม่น้ำ; ลำธาร|ทะเล|ทะเลสาบ|หิน|ทราย|ต้นไม้|ใบไม้|ราก|ดอกไม้
เมล็ด|หญ้า|ไม้; เนื้อไม้|ผลไม้|อาหาร|ขนมปัง|เนื้อสัตว์|เกลือ|นม|ไข่
พ่อ; บิดา|แม่; มารดา|พี่ชาย; น้องชาย|พี่สาว; น้องสาว|เด็ก|ผู้หญิง|สุนัข; หมา|แมว|นก|ปลา
ม้า|วัวตัวเมีย|แกะ|แพะ|หมู|หัว; ศีรษะ|ตา|หู|จมูก|ปาก
ฟัน|ลิ้น|มือ|เท้า|หัวใจ|เลือด|กระดูก|ผิวหนัง|ผม|บ้าน
ประตู|หน้าต่าง|ผนัง; กำแพง|หลังคา|เตียง|เก้าอี้|โต๊ะ|โรงเรียน|หนังสือ|ชื่อ
วัน; กลางวัน|กลางคืน|ปี|ถนน; ทาง|สะพาน|เรือ|มีด|เข็ม|เชือก|เงิน
"""),
    "id": ("Indonesian", """
air|api|matahari|bulan|bintang|langit|hujan|salju|angin|awan
gunung; bukit|sungai; anak sungai|laut|danau|batu|pasir|pohon|daun|akar|bunga
benih; biji|rumput|kayu|buah|makanan|roti|daging|garam|susu|telur
ayah; bapak|ibu|saudara laki-laki|saudara perempuan|anak|perempuan; wanita|anjing|kucing|burung|ikan
kuda|sapi betina|domba|kambing|babi|kepala|mata|telinga|hidung|mulut
gigi|lidah|tangan|kaki|jantung|darah|tulang|kulit|rambut|rumah
pintu; gerbang|jendela|dinding; tembok|atap|tempat tidur|kursi|meja|sekolah|buku|nama
hari; siang|malam|tahun|jalan|jembatan|perahu|pisau|jarum|tali|uang
"""),
    "ms": ("Malay", """
air|api|matahari|bulan|bintang|langit|hujan|salji|angin|awan
gunung; bukit|sungai; anak sungai|laut|tasik|batu|pasir|pokok|daun|akar|bunga
benih; biji|rumput|kayu|buah|makanan|roti|daging|garam|susu|telur
bapa; ayah|ibu; emak|saudara lelaki|saudara perempuan|kanak-kanak|wanita; perempuan|anjing|kucing|burung|ikan
kuda|lembu betina|biri-biri|kambing|babi|kepala|mata|telinga|hidung|mulut
gigi|lidah|tangan|kaki|jantung|darah|tulang|kulit|rambut|rumah
pintu; pintu gerbang|tingkap|dinding; tembok|bumbung|katil|kerusi|meja|sekolah|buku|nama
hari; siang|malam|tahun|jalan|jambatan|perahu|pisau|jarum|tali|wang; duit
"""),
    "fil": ("Filipino", """
tubig|apoy|araw|buwan|bituin|langit|ulan|niyebe|hangin|ulap
bundok; burol|ilog; sapa|dagat|lawa|bato|buhangin|puno|dahon|ugat|bulaklak
binhi; buto|damo|kahoy|prutas; bunga|pagkain|tinapay|karne|asin|gatas|itlog
ama; tatay|ina; nanay|kapatid na lalaki|kapatid na babae|bata|babae|aso|pusa|ibon|isda
kabayo|babaeng baka|tupa|kambing|baboy|ulo|mata|tainga|ilong|bibig
ngipin|dila|kamay|paa|puso|dugo|buto|balat|buhok|bahay
pinto; tarangkahan|bintana|dingding; pader|bubong|kama; higaan|upuan; silya|mesa; hapag|paaralan|aklat; libro|pangalan
araw|gabi|taon|daan; kalsada|tulay|bangka|kutsilyo|karayom|lubid; tali|pera; salapi
"""),
    "sw": ("Swahili", """
maji|moto|jua|mwezi|nyota|anga|mvua|theluji|upepo|wingu
mlima; kilima|mto; kijito|bahari|ziwa|jiwe; mwamba|mchanga|mti|jani|mzizi|ua
mbegu|nyasi|mbao|tunda|chakula|mkate|nyama|chumvi|maziwa|yai
baba|mama|kaka; ndugu wa kiume|dada; ndugu wa kike|mtoto|mwanamke|mbwa|paka|ndege|samaki
farasi|ng'ombe jike|kondoo|mbuzi|nguruwe|kichwa|jicho|sikio|pua|mdomo
jino|ulimi|mkono|mguu|moyo|damu|mfupa|ngozi|nywele|nyumba
mlango; lango|dirisha|ukuta|paa|kitanda|kiti|meza|shule|kitabu|jina
siku; mchana|usiku|mwaka|barabara; njia|daraja|mashua|kisu|sindano|kamba|pesa; fedha
"""),
    "ca": ("Catalan", """
aigua|foc|sol|lluna|estrella; estel|cel|pluja|neu|vent|núvol
muntanya; turó|riu; rierol|mar|llac|pedra; roca|sorra|arbre|fulla|arrel|flor
llavor|herba|fusta|fruita; fruit|menjar; aliment|pa|carn|sal|llet|ou
pare|mare|germà|germana|infant; nen; nena|dona|gos|gat|ocell; au|peix
cavall|vaca|ovella|cabra|porc|cap|ull|orella|nas|boca
dent|llengua|mà|peu|cor|sang|os|pell|cabells|casa
porta; portal|finestra|paret; mur|teulada|llit|cadira|taula|escola|llibre|nom
dia|nit|any|camí; carretera|pont|barca|ganivet|agulla|corda|diners
"""),
}

READINGS = {
    "zh-CN": """
shuǐ|huǒ|tàiyáng|yuèliang|xīngxing|tiānkōng|yǔ|xuě|fēng|yún
shān|hé|hǎi|hú|shítou|shāzi|shù|yèzi|gēn|huā
zhǒngzi|cǎo|mùcái|shuǐguǒ|shíwù|miànbāo|ròu|yán|niúnǎi|dàn
fùqīn|mǔqīn|gēge|jiějie|háizi|nǚrén|gǒu|māo|niǎo|yú
mǎ|mǔniú|miányáng|shānyáng|zhū|tóu|yǎnjing|ěrduo|bízi|zuǐ
yáchǐ|shétou|shǒu|jiǎo|xīnzàng|xuè|gǔtou|pífū|tóufa|fángzi
mén|chuānghu|qiáng|wūdǐng|chuáng|yǐzi|zhuōzi|xuéxiào|shū|míngzi
báitiān|yèwǎn|nián|lù|qiáo|chuán|dāo|zhēn|shéngzi|qián
""",
    "ja": """
みず|ひ|たいよう|つき|ほし|そら|あめ|ゆき|かぜ|くも
やま|かわ|うみ|みずうみ|いし|すな|き|は|ね|はな
たね|くさ|もくざい|くだもの|たべもの|パン|にく|しお|ぎゅうにゅう|たまご
ちち|はは|あに|あね|こども|じょせい|いぬ|ねこ|とり|さかな
うま|めうし|ひつじ|やぎ|ぶた|あたま|め|みみ|はな|くち
は|した|て|あし|しんぞう|ち|ほね|ひふ|かみ|いえ
ドア|まど|かべ|やね|ベッド|いす|テーブル|がっこう|ほん|なまえ
ひ|よる|とし|みち|はし|ふね|ナイフ|はり|なわ|おかね
""",
}


def fields(text):
    return [field.strip() for line in text.strip().splitlines() for field in line.split("|")]


def main():
    board = json.loads((DIRECTORY / "concepts.json").read_text(encoding="utf-8"))
    existing = {row["id"]: row for row in board["rows"]}
    concepts = [entry.split(" ", 1) for entry in fields(CONCEPTS)]
    rows = []
    for number, label in concepts:
        identifier = "ids:" + number
        if existing[identifier]["label"] != label:
            raise ValueError(f"Sense changed for {identifier}")
        rows.append({"id": identifier, "sense": label, "cells": {}})
    for code, (_, text) in LANGUAGES.items():
        words = fields(text)
        if len(words) != len(rows):
            raise ValueError(f"{code} has {len(words)} cells, expected {len(rows)}")
        for row, word in zip(rows, words):
            forms = [form.strip() for form in word.split(";")]
            if any(not form for form in forms):
                raise ValueError(f"Empty form in {code} {row['id']}")
            row["cells"][code] = {"forms": forms}
    for code, text in READINGS.items():
        readings = fields(text)
        if len(readings) != len(rows):
            raise ValueError(f"Wrong number of {code} readings")
        for row, reading in zip(rows, readings):
            row["cells"][code]["reading"] = reading
            if code == "zh-CN":
                row["cells"]["zh-TW"]["reading"] = reading
    output = {
        "schemaVersion": 1,
        "source": {
            "id": "assistant-core-2026-11", "name": "Assistant-authored core vocabulary, November 2026",
            "review": "assistant-generated", "author": "OpenAI assistant", "created": "2026-11-09",
            "url": "dictionary/GENERATED.md", "license": "Assistant-generated content",
            "notes": "Unreviewed translations, activated directly at the user's request. Coverage is limited to the listed concepts and languages.",
        },
        "languages": {code: name for code, (name, _) in LANGUAGES.items()}, "rows": rows,
    }
    (DIRECTORY / "assistant-core.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    catalog_path = DIRECTORY / "catalog.json"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    catalog["generatedFiles"] = list(dict.fromkeys([*catalog.get("generatedFiles", []), "assistant-core.json"]))
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Authored {len(rows)} concepts in {len(LANGUAGES)} languages, {len(rows) * len(LANGUAGES)} cells")


if __name__ == "__main__":
    main()
