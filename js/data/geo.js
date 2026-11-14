// Hand-traced (approximate) geography of Calgary in lat/lon. Projected to game metres at load.
(function () {
  const CP = window.CP;
  const P = CP.projectLine;

  CP.GEO = {
    rivers: [
      {
        name: "Bow River", width: 120,
        line: P([[51.130, -114.300], [51.105, -114.245], [51.096, -114.215], [51.088, -114.190], [51.079, -114.168], [51.068, -114.150], [51.063, -114.130], [51.059, -114.108], [51.054, -114.088], [51.055, -114.073], [51.053, -114.058], [51.047, -114.043], [51.044, -114.030], [51.039, -114.020], [51.028, -114.016], [51.010, -114.012], [50.990, -114.017], [50.968, -114.012], [50.948, -114.002], [50.925, -114.004], [50.905, -113.996], [50.880, -113.982], [50.850, -113.972], [50.800, -113.955]]),
      },
      {
        name: "Elbow River", width: 55,
        line: P([[50.955, -114.235], [50.965, -114.190], [50.972, -114.160], [50.985, -114.110], [50.996, -114.100], [51.010, -114.092], [51.022, -114.090], [51.028, -114.082], [51.034, -114.072], [51.036, -114.062], [51.040, -114.055], [51.045, -114.045]]),
      },
      {
        name: "Fish Creek", width: 22,
        line: P([[50.925, -114.230], [50.920, -114.180], [50.918, -114.140], [50.915, -114.110], [50.913, -114.075], [50.912, -114.040], [50.910, -114.010], [50.908, -113.998]]),
      },
      {
        name: "Nose Creek", width: 18,
        line: P([[51.190, -114.010], [51.150, -114.020], [51.110, -114.030], [51.080, -114.035], [51.060, -114.040], [51.050, -114.042]]),
      },
    ],
    lakes: [
      { name: "Glenmore Reservoir", poly: P([[50.997, -114.104], [50.991, -114.096], [50.983, -114.100], [50.976, -114.110], [50.971, -114.124], [50.967, -114.140], [50.970, -114.152], [50.977, -114.147], [50.983, -114.137], [50.989, -114.128], [50.995, -114.116]]) },
    ],
    bigParks: [
      { name: "Nose Hill Park", poly: P([[51.130, -114.140], [51.131, -114.095], [51.118, -114.080], [51.100, -114.085], [51.098, -114.120], [51.110, -114.140]]) },
      { name: "Fish Creek Provincial Park", poly: P([[50.928, -114.200], [50.925, -114.100], [50.922, -114.030], [50.912, -113.998], [50.903, -114.010], [50.908, -114.100], [50.913, -114.200]]) },
      { name: "Weaselhead Flats", poly: P([[50.972, -114.175], [50.975, -114.150], [50.965, -114.140], [50.960, -114.170]]) },
      { name: "Bowness Park", poly: P([[51.099, -114.225], [51.098, -114.205], [51.092, -114.205], [51.093, -114.222]]) },
      { name: "Prince's Island Park", poly: P([[51.0565, -114.0745], [51.0560, -114.0655], [51.0545, -114.0660], [51.0550, -114.0745]]) },
    ],
    roads: [
      { name: "Deerfoot Trail", w: 34, line: P([[51.220, -113.995], [51.160, -113.998], [51.120, -114.008], [51.085, -114.025], [51.060, -114.036], [51.042, -114.027], [51.020, -114.024], [50.990, -114.032], [50.960, -114.022], [50.930, -114.010], [50.895, -113.990], [50.850, -113.980], [50.800, -113.975]]) },
      { name: "Stoney Trail", w: 34, line: P([[51.155, -114.215], [51.172, -114.150], [51.175, -114.080], [51.168, -113.990], [51.150, -113.940], [51.100, -113.925], [51.040, -113.925], [50.985, -113.925], [50.930, -113.935], [50.890, -113.960], [50.880, -114.040], [50.890, -114.110], [50.930, -114.165], [50.980, -114.215], [51.040, -114.225], [51.100, -114.225], [51.155, -114.215]]) },
      { name: "Crowchild Trail", w: 26, line: P([[51.160, -114.230], [51.120, -114.195], [51.095, -114.160], [51.075, -114.128], [51.060, -114.108], [51.045, -114.102], [51.030, -114.110], [51.010, -114.122], [50.990, -114.130]]) },
      { name: "Glenmore Trail", w: 26, line: P([[50.975, -114.215], [50.982, -114.160], [50.985, -114.095], [50.982, -114.060], [50.980, -114.030], [50.985, -113.960], [50.988, -113.900]]) },
      { name: "16 Avenue N (Trans-Canada)", w: 24, line: P([[51.085, -114.260], [51.073, -114.200], [51.067, -114.150], [51.067, -114.080], [51.067, -114.020], [51.068, -113.960], [51.068, -113.900]]) },
      { name: "Macleod Trail", w: 22, line: P([[51.045, -114.062], [51.020, -114.064], [50.990, -114.070], [50.950, -114.071], [50.910, -114.070], [50.870, -114.065], [50.830, -114.060]]) },
      { name: "McKnight Boulevard", w: 20, line: P([[51.097, -114.140], [51.097, -114.060], [51.097, -113.990], [51.097, -113.925]]) },
      { name: "International Avenue (17 Ave SE)", w: 18, line: P([[51.038, -114.040], [51.038, -113.990], [51.038, -113.930]]) },
      { name: "Sarcee Trail", w: 20, line: P([[51.090, -114.180], [51.060, -114.175], [51.030, -114.168], [51.000, -114.160], [50.980, -114.162]]) },
      { name: "Memorial Drive", w: 18, line: P([[51.065, -114.140], [51.058, -114.100], [51.054, -114.080], [51.053, -114.050], [51.048, -114.030], [51.050, -113.960], [51.052, -113.930]]) },
      { name: "Country Hills Boulevard", w: 18, line: P([[51.150, -114.200], [51.155, -114.120], [51.155, -114.050], [51.150, -113.950]]) },
      { name: "Anderson Road", w: 18, line: P([[50.955, -114.150], [50.955, -114.070], [50.955, -114.020]]) },
    ],
    ctrain: [
      { name: "Red Line", color: "#e2202c", line: P([[51.0465, -114.090], [51.046, -114.065], [51.035, -114.062], [51.000, -114.067], [50.960, -114.069], [50.920, -114.068], [50.885, -114.070]]) },
      { name: "Red Line (NW)", color: "#e2202c", line: P([[51.0465, -114.090], [51.054, -114.095], [51.070, -114.120], [51.080, -114.135], [51.100, -114.168], [51.125, -114.200], [51.140, -114.215]]) },
      { name: "Blue Line (NE)", color: "#1c6fd9", line: P([[51.046, -114.065], [51.046, -114.045], [51.050, -114.010], [51.057, -113.985], [51.080, -113.982], [51.100, -113.968], [51.120, -113.948]]) },
      { name: "Blue Line (W)", color: "#1c6fd9", line: P([[51.0465, -114.090], [51.045, -114.120], [51.042, -114.160], [51.040, -114.210]]) },
    ],
    airport: P([[51.150, -114.040], [51.150, -113.990], [51.105, -113.985], [51.100, -114.040]]),
  };

  // Notable Calgary buildings. `kind` picks a custom draw routine in render.js.
  // `h` is drawn height in metres. `essential` buildings provide services in the sim.
  const L = (name, lat, lon, kind, h, extra) => Object.assign({ name, kind, h, pos: CP.project(lat, lon) }, extra || {});
  CP.LANDMARKS = [
    L("Calgary Tower", 51.0443, -114.0631, "calgaryTower", 191, { blurb: "191 m of 1968 optimism, with a glass floor at the top." }),
    L("The Bow", 51.0478, -114.0616, "bow", 236, { blurb: "Norman Foster's crescent tower, home of the Wonderland head." }),
    L("Brookfield Place", 51.0466, -114.0697, "tower", 247, { w: 50, d: 40, color: "#7fa8c9", blurb: "Tallest office tower in Western Canada." }),
    L("TELUS Sky", 51.0470, -114.0655, "tower", 222, { w: 34, d: 34, color: "#9fc3d8", blurb: "Twisting stack of offices and homes by BIG." }),
    L("Suncor Energy Centre", 51.0482, -114.0705, "tower", 215, { w: 44, d: 44, color: "#3d6b8f", blurb: "Twin-pyramid-capped towers of the oil boom." }),
    L("Scotiabank Saddledome", 51.0374, -114.0519, "saddledome", 30, { blurb: "Hyperbolic paraboloid roof - and a lot of Flames fans.", belonging: true }),
    L("Calgary Central Library", 51.0457, -114.0547, "library", 28, { blurb: "Snøhetta's chinook-cloud library over the CTrain.", service: "library" }),
    L("Studio Bell", 51.0446, -114.0525, "studioBell", 40, { blurb: "National Music Centre's tiled ceramic towers." }),
    L("Peace Bridge", 51.0545, -114.0794, "peaceBridge", 6, { blurb: "Calatrava's red helix footbridge over the Bow." }),
    L("Calgary City Hall", 51.0453, -114.0578, "cityHall", 30, { blurb: "Sandstone 1911 hall plus the mirrored municipal building." }),
    L("Calgary Zoo", 51.0459, -114.0299, "zoo", 6, { blurb: "Wilder Institute - dinosaurs, penguins, and pandas once." }),
    L("TELUS Spark", 51.0510, -114.0402, "spark", 18, { blurb: "Science centre with a big dome theatre." }),
    L("BMO Centre", 51.0395, -114.0555, "stampede", 18, { blurb: "Stampede Park - the Greatest Outdoor Show on Earth.", belonging: true }),
    L("McMahon Stadium", 51.0703, -114.1215, "stadium", 20, { blurb: "Home of the Calgary Stampeders." }),
    L("University of Calgary", 51.0780, -114.1330, "campus", 25, { blurb: "33,000 students - and a lot of economic opportunity." }),
    L("Foothills Medical Centre", 51.0652, -114.1336, "hospital", 45, { blurb: "Alberta's largest hospital.", service: "hospital" }),
    L("Peter Lougheed Centre", 51.0790, -113.9840, "hospital", 35, { blurb: "NE Calgary's acute care hospital.", service: "hospital" }),
    L("Rockyview General Hospital", 50.9906, -114.0981, "hospital", 32, { blurb: "Southwest hospital on the Glenmore Reservoir.", service: "hospital" }),
    L("South Health Campus", 50.8822, -113.9554, "hospital", 38, { blurb: "Newest full hospital, in Seton.", service: "hospital" }),
    L("Alberta Children's Hospital", 51.0745, -114.1468, "kidsHospital", 30, { blurb: "The crayon-box hospital.", service: "hospital" }),
    L("Chinook Centre", 50.9985, -114.0730, "mall", 16, { blurb: "Calgary's biggest mall.", service: "grocery" }),
    L("Canada Olympic Park", 51.0833, -114.2140, "skiJump", 70, { blurb: "1988 Winter Olympics ski jumps." }),
    L("Heritage Park", 50.9840, -114.1040, "heritage", 10, { blurb: "Living history village on the reservoir." }),
    L("Calgary International Airport", 51.1260, -114.0120, "airport", 22, { blurb: "YYC - Canada's 4th busiest airport." }),
    L("Fort Calgary", 51.0457, -114.0446, "fort", 8, { blurb: "Where the Bow meets the Elbow - Calgary's 1875 origin." }),
  ];
})();
