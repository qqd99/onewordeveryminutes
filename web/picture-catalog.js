/* Curated public-photograph quiz. Free-license thumbnails: Wikimedia/Wikipedia. */
(function(root) {
  "use strict";
  // Each concept is manually linked to a particular Wikipedia article,
  // never to a free-form image search; only freely licensed page images are used.
  const photoArticles = {"apple":"Apple","banana":"Banana","cherry":"Cherry","citrus":"Orange (fruit)","grape":"Grape","carrot":"Carrot","fish":"Fish","egg":"Egg as food","milk":"Milk","coffee":"Coffee","cup-soda":"Juice","cake":"Cake","pizza":"Pizza","soup":"Soup","ice-cream-cone":"Ice cream","beef":"Beef","salad":"Salad","sandwich":"Sandwich","donut":"Doughnut","candy":"Candy","cookie":"Cookie","book-open":"Book","pencil":"Pencil","hospital":"Hospital","stethoscope":"Physician","house":"House","hotel":"Hotel","mountain":"Mountain","trees":"Forest","flower-2":"Flower","leaf":"Leaf","cloud":"Cloud","cloud-rain":"Rain","snowflake":"Snow","rainbow":"Rainbow","flame":"Fire","droplet":"Water","umbrella":"Umbrella","alarm-clock":"Alarm clock","watch":"Watch","car":"Car","bus-front":"Bus","train-front":"Train","plane":"Airplane","ship":"Ship","bike":"Bicycle","truck":"Truck","compass":"Compass","camera":"Camera","tv":"Television","smartphone":"Smartphone","laptop":"Laptop","monitor":"Computer monitor","keyboard":"Computer keyboard","headphones":"Headphones","phone":"Telephone","wallet":"Wallet","coins":"Coin","banknote":"Banknote","cat":"Cat","dog":"Dog","bird":"Bird","turtle":"Turtle","bug":"Insect","rabbit":"Rabbit","baby":"Infant","hand":"Hand","eye":"Human eye","ear":"Ear","brain":"Human brain","shirt":"Shirt","glasses":"Glasses","key":"Key (lock)","lock":"Padlock","bed":"Bed","bath":"Bathtub","door-open":"Door","armchair":"Armchair","lamp-desk":"Lamp","washing-machine":"Washing machine","refrigerator":"Refrigerator","scissors":"Scissors","hammer":"Hammer","wrench":"Wrench","paintbrush":"Paintbrush","dumbbell":"Dumbbell","guitar":"Guitar"};

  const explicitFronts = {"apple":"苹果","banana":"香蕉","grape":"葡萄","fish":"鱼","egg":"鸡蛋","milk":"牛奶","coffee":"咖啡","cake":"蛋糕 生日","soup":"汤","salad":"沙拉","pizza":"披萨 比萨","carrot":"胡萝卜","cherry":"樱桃","citrus":"柠檬 橘子 橙子","sandwich":"三明治","donut":"甜甜圈","cookie":"饼干","candy":"糖","ice-cream-cone":"冰淇淋","book-open":"书 图书 读 阅读 图书馆","pencil":"铅笔","pen-line":"写 写字","school":"学校","graduation-cap":"毕业","hospital":"医院","stethoscope":"医生 大夫","store":"商店 超市 市场","house":"家 房子 家庭","hotel":"宾馆 旅馆","mountain":"山 爬山","trees":"树 森林 公园","flower-2":"花 朵 花园","leaf":"叶子 草","sun":"太阳 日 晴","moon":"月亮","cloud":"云 阴","cloud-rain":"下雨 雨","cloud-snow":"下雪","snowflake":"雪 冬天","wind":"刮风 风","rainbow":"彩虹","flame":"火","droplet":"水","umbrella":"伞","clock":"时间 小时 分钟 时候","alarm-clock":"闹钟","calendar":"日历 星期 周末","watch":"手表","car":"车 汽车","bus-front":"公共汽车 公交车","train-front":"火车 地铁","plane":"飞机 起飞 航班","ship":"船","bike":"自行车","truck":"卡车 货车","map-pin":"地点","globe":"地球 世界","compass":"方向","camera":"照相机 照相","film":"电影","tv":"电视","smartphone":"手机","laptop":"电脑 笔记本电脑","monitor":"显示器","keyboard":"键盘","headphones":"耳机","phone":"打电话 电话","mail":"信 邮件","gift":"礼物","shopping-cart":"购物 买东西","wallet":"钱包","coins":"钱 硬币","banknote":"纸币 人民币","heart":"爱 爱情","cat":"猫","dog":"狗","bird":"鸟","turtle":"乌龟","bug":"虫 昆虫","rabbit":"兔子","paw-print":"动物","user":"人","users":"人们","baby":"婴儿 宝宝","person-standing":"站 站立","hand":"手","eye":"眼睛","ear":"耳朵","brain":"大脑","shirt":"衬衫","glasses":"眼镜","key":"钥匙","lock":"锁","bed":"床 睡觉","bath":"洗澡","door-open":"门 开门","armchair":"椅子 沙发","lamp-desk":"灯","washing-machine":"洗衣机","refrigerator":"冰箱","fan":"风扇","lightbulb":"灯泡","scissors":"剪刀","hammer":"锤子","wrench":"工具","paintbrush":"画 画画","palette":"颜色","dumbbell":"运动 锻炼","trophy":"冠军 比赛","flag":"旗 旗帜","guitar":"吉他"};
  const exactEnglish = {"apple":"apple","banana":"banana","cherry":"cherry","citrus":"orange lemon citrus","grape":"grape grapes","carrot":"carrot","fish":"fish","egg":"egg chicken egg","milk":"milk cow's milk","coffee":"coffee","cup-soda":"drink beverage juice fruit juice","cake":"cake birthday cake","pizza":"pizza","soup":"soup","cooking-pot":"cooking pot","ice-cream-cone":"ice cream","beef":"beef","salad":"salad","sandwich":"sandwich","donut":"donut doughnut","candy":"candy sweet","cookie":"cookie biscuit","book-open":"book books to read library","pencil":"pencil","pen-line":"pen writing to write","school":"school","graduation-cap":"graduation","hospital":"hospital","stethoscope":"doctor physician","store":"shop store supermarket","house":"house home","hotel":"hotel guesthouse","mountain":"mountain","trees":"tree forest","flower-2":"flower flowers","leaf":"leaf leaves grass","sun":"sun sunshine","moon":"moon","cloud":"cloud","cloud-rain":"rain to rain","cloud-snow":"snowing","snowflake":"snow","wind":"wind","rainbow":"rainbow","flame":"fire flame","droplet":"water","umbrella":"umbrella","clock":"time hour minute","alarm-clock":"alarm clock","calendar":"calendar","watch":"watch wristwatch wrist watch","car":"car automobile","bus-front":"bus","train-front":"train subway metro","plane":"airplane plane aircraft","ship":"ship boat","bike":"bicycle bike","truck":"truck","map-pin":"location","globe":"earth world globe","compass":"compass","camera":"camera","film":"movie film","tv":"television tv","smartphone":"mobile phone smartphone cellphone","laptop":"computer laptop","monitor":"monitor screen","keyboard":"keyboard","headphones":"headphones","phone":"telephone phone","mail":"letter mail email","gift":"gift present","shopping-cart":"shopping to shop","wallet":"wallet","coins":"coin coins money","banknote":"banknote cash","heart":"love romance","cat":"cat","dog":"dog","bird":"bird","turtle":"turtle","bug":"insect bug","rabbit":"rabbit","paw-print":"animal animals","user":"person people","users":"group people","baby":"baby infant","person-standing":"to stand","hand":"hand","eye":"eye","ear":"ear","brain":"brain","shirt":"shirt","glasses":"glasses spectacles","key":"key","lock":"lock","bed":"bed","bath":"bath","door-open":"door","armchair":"chair sofa armchair","lamp-desk":"lamp","washing-machine":"washing machine","refrigerator":"refrigerator fridge","fan":"fan","lightbulb":"light bulb lightbulb","scissors":"scissors","hammer":"hammer","wrench":"wrench","paintbrush":"paintbrush","palette":"palette color colour","dumbbell":"exercise workout","trophy":"trophy","flag":"flag","guitar":"guitar"};
  const categories = {"food":"apple banana cherry citrus grape carrot fish egg milk coffee cup-soda cake pizza soup cooking-pot ice-cream-cone beef salad sandwich donut candy cookie","education":"book-open pencil pen-line school graduation-cap","places":"hospital stethoscope store house hotel","nature":"mountain trees flower-2 leaf sun moon cloud cloud-rain cloud-snow snowflake wind rainbow flame droplet","time":"clock alarm-clock calendar watch hourglass","transport":"car bus-front train-front plane ship bike truck","travel":"map-pin globe compass","media":"camera film tv smartphone laptop monitor keyboard headphones phone mail","goods":"gift shopping-cart wallet coins banknote key lock","feelings":"heart","animal":"cat dog bird turtle bug rabbit paw-print","people":"user users baby person-standing","body":"hand eye ear brain","home":"shirt glasses bed bath door-open armchair lamp-desk washing-machine refrigerator fan lightbulb","activities":"scissors hammer wrench paintbrush palette dumbbell trophy flag guitar","other":"umbrella"};
  // Reject misleading illustrations for ambiguous / incorrectly glossed cards.
  const excludedFronts = new Set(["水果", "博士", "轻", "站", "季节", "运动", "糖", "甜"]);
  const byFront = new Map();
  const byMeaning = new Map();
  const groupByIcon = new Map();
  for (const [group, names] of Object.entries(categories)) {
    for (const name of names.split(" ")) groupByIcon.set(name, group);
  }
  for (const [icon, words] of Object.entries(explicitFronts)) {
    for (const word of words.split(" ")) byFront.set(word, icon);
  }
  for (const [icon, aliases] of Object.entries(exactEnglish)) {
    // A single-word dictionary definition may match a curated concept.
    // Never search substrings: "carpet" must not become a car.
    for (const word of aliases.split(/\\s+/)) {
      if (/^[a-z-]{3,}$/.test(word) && !["one", "the", "cow", "its", "group", "people", "fruit", "sweet", "light"].includes(word)) {
        byMeaning.set(word, icon);
      }
    }
  }
  const multiWordMeanings = {
    "ice-cream-cone": ["ice cream"],
    "cup-soda": ["fruit juice"],
    milk: ["cow's milk"],
    egg: ["chicken egg"],
    "cup-soda": ["fruit juice"],
    smartphone: ["mobile phone", "cell phone"],
    watch: ["wrist watch", "wristwatch"],
    pencil: ["lead pencil"],
    "pen-line": ["to write"],
    "book-open": ["to read"],
    "train-front": ["subway train"],
    "cloud-rain": ["to rain"],
    "person-standing": ["to stand"],
    plane: ["an airplane"],
    ship: ["a boat"],
    "paw-print": ["domestic animal"]
  };
  for (const [icon, aliases] of Object.entries(multiWordMeanings)) {
    for (const phrase of aliases) byMeaning.set(phrase, icon);
  }
  function pictureFor(card) {
    if (!card || typeof card !== "object") return null;
    if (excludedFronts.has(String(card.front || "").trim())) return null;
    const front = String(card.front || "").trim();
    const meaning = String(card.meaning || "").trim().toLowerCase()
      .replace(/[.!。]+$/u, "").replace(/^(?:a|an|the)\s+/i, "");
    const icon = byFront.get(front) || byMeaning.get(meaning);
    return icon && Object.prototype.hasOwnProperty.call(photoArticles, icon) ? icon : null;
  }
  function groupFor(icon) { return groupByIcon.get(icon) || "other"; }

  const photoRequests = new Map();
  function articleFor(icon) { return photoArticles[icon] || null; }
  function imageQueryUrl(icon) {
    const title = articleFor(icon);
    if (!title) return "";
    const query = new URLSearchParams({
      action: "query", format: "json", formatversion: "2",
      prop: "pageimages", piprop: "thumbnail|name", pithumbsize: "560",
      pilicense: "free", redirects: "1", titles: title, origin: "*"
    });
    return "https://en.wikipedia.org/w/api.php?" + query.toString();
  }
  async function loadPhoto(icon) {
    if (!articleFor(icon)) throw new Error("No curated photograph for this word.");
    if (photoRequests.has(icon)) return photoRequests.get(icon);
    const task = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      let page;
      try {
        const response = await fetch(imageQueryUrl(icon), {
          signal: controller.signal, credentials: "omit", mode: "cors"
        });
        if (!response.ok) throw new Error("Public photo API unavailable");
        const data = await response.json();
        page = data?.query?.pages?.find(item => item.thumbnail?.source && item.pageimage);
      } finally {
        clearTimeout(timeout);
      }
      const src = page?.thumbnail?.source;
      if (!src || !/^https:\/\/upload\.wikimedia\.org\//.test(src)) {
        throw new Error("No freely licensed photograph was found for this word.");
      }
      // A loaded thumbnail is required before the learner can choose it.
      await new Promise((resolve, reject) => {
        const preview = new Image();
        const wait = setTimeout(() => {
          preview.onload = preview.onerror = null;
          reject(new Error("Public photo download timed out"));
        }, 12000);
        preview.onload = () => { clearTimeout(wait); resolve(); };
        preview.onerror = () => { clearTimeout(wait); reject(new Error("Public photo could not load")); };
        preview.src = src;
      });
      const filename = page.pageimage.replace(/^File:/, "");
      return {
        src,
        sourceUrl: "https://en.wikipedia.org/wiki/File:" + encodeURIComponent(filename.replace(/ /g, "_")),
        articleUrl: "https://en.wikipedia.org/wiki/" + encodeURIComponent(articleFor(icon).replace(/ /g, "_")),
        icon
      };
    })();
    photoRequests.set(icon, task);
    task.catch(() => { if (photoRequests.get(icon) === task) photoRequests.delete(icon); });
    return task;
  }
  root.PictureCatalog = Object.freeze({
    pictureFor, groupFor, articleFor, imageQueryUrl, loadPhoto,
    assetCount: Object.keys(photoArticles).length
  });
})(typeof window !== "undefined" ? window : globalThis);
