<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" tiledversion="1.11.2" name="town" tilewidth="16" tileheight="16" tilecount="132" columns="12" objectalignment="topleft">
 <transformations hflip="1" vflip="1" rotate="0" preferuntransformed="1"/>
 <image source="kenney_tiny-town/Tilemap/tilemap_packed.png" width="192" height="176"/>
 <tile id="44">
  <objectgroup draworder="index" id="2">
   <object id="1" x="4" y="2" width="12" height="14"/>
  </objectgroup>
 </tile>
 <tile id="45">
  <objectgroup draworder="index" id="2">
   <object id="1" x="0" y="2" width="16" height="12"/>
  </objectgroup>
 </tile>
 <tile id="46">
  <objectgroup draworder="index" id="2">
   <object id="1" x="0" y="2" width="12" height="14"/>
  </objectgroup>
 </tile>
 <tile id="47">
  <objectgroup draworder="index" id="2">
   <object id="1" x="4" y="2" width="8" height="14"/>
  </objectgroup>
 </tile>
 <tile id="56">
  <objectgroup draworder="index" id="2">
   <object id="1" x="4" y="0" width="8" height="16"/>
  </objectgroup>
 </tile>
 <tile id="58">
  <objectgroup draworder="index" id="2">
   <object id="1" x="4" y="0" width="8" height="16"/>
  </objectgroup>
 </tile>
 <tile id="59">
  <objectgroup draworder="index" id="2">
   <object id="1" x="4" y="0" width="8" height="16"/>
  </objectgroup>
 </tile>
 <tile id="68">
  <objectgroup draworder="index" id="2">
   <object id="1" x="4" y="0" width="12" height="14"/>
  </objectgroup>
 </tile>
 <tile id="69">
  <objectgroup draworder="index" id="5">
   <object id="10" x="0" y="1.86487" width="6.99326" height="12.1217"/>
   <object id="11" x="9.03296" y="2.0397" width="6.87671" height="12.0051"/>
  </objectgroup>
 </tile>
 <tile id="70">
  <objectgroup draworder="index" id="2">
   <object id="1" x="0" y="0" width="12" height="14"/>
  </objectgroup>
 </tile>
 <tile id="71">
  <objectgroup draworder="index" id="2">
   <object id="1" x="4" y="0" width="8" height="14"/>
  </objectgroup>
 </tile>
 <tile id="80">
  <objectgroup draworder="index" id="3">
   <object id="2" x="4" y="2" width="12" height="12"/>
  </objectgroup>
 </tile>
 <tile id="81">
  <objectgroup draworder="index" id="2">
   <object id="1" x="0" y="5" width="16" height="8"/>
  </objectgroup>
 </tile>
 <tile id="82">
  <objectgroup draworder="index" id="2">
   <object id="1" x="0" y="2" width="12" height="12"/>
  </objectgroup>
 </tile>
 <wangsets>
  <wangset name="barrier" type="edge" tile="-1">
   <wangcolor name="barrier" color="#ff0000" tile="-1" probability="1"/>
   <wangtile tileid="44" wangid="0,0,1,0,1,0,0,0"/>
   <wangtile tileid="46" wangid="0,0,0,0,1,0,1,0"/>
   <wangtile tileid="47" wangid="0,0,0,0,1,0,0,0"/>
   <wangtile tileid="59" wangid="1,0,0,0,1,0,0,0"/>
   <wangtile tileid="68" wangid="1,0,1,0,0,0,0,0"/>
   <wangtile tileid="70" wangid="1,0,0,0,0,0,1,0"/>
   <wangtile tileid="71" wangid="1,0,0,0,0,0,0,0"/>
   <wangtile tileid="80" wangid="0,0,1,0,0,0,0,0"/>
   <wangtile tileid="81" wangid="0,0,1,0,0,0,1,0"/>
   <wangtile tileid="82" wangid="0,0,0,0,0,0,1,0"/>
  </wangset>
  <wangset name="mud" type="corner" tile="-1">
   <wangcolor name="mud" color="#ff0000" tile="-1" probability="1"/>
   <wangcolor name="grass" color="#00ff00" tile="-1" probability="1"/>
   <wangtile tileid="0" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="1" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="2" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="12" wangid="0,2,0,1,0,2,0,2"/>
   <wangtile tileid="13" wangid="0,2,0,1,0,1,0,2"/>
   <wangtile tileid="14" wangid="0,2,0,2,0,1,0,2"/>
   <wangtile tileid="24" wangid="0,1,0,1,0,2,0,2"/>
   <wangtile tileid="25" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="26" wangid="0,2,0,2,0,1,0,1"/>
   <wangtile tileid="36" wangid="0,1,0,2,0,2,0,2"/>
   <wangtile tileid="37" wangid="0,1,0,2,0,2,0,1"/>
   <wangtile tileid="38" wangid="0,2,0,2,0,2,0,1"/>
   <wangtile tileid="39" wangid="0,1,0,1,0,1,0,2"/>
   <wangtile tileid="40" wangid="0,2,0,1,0,1,0,1"/>
   <wangtile tileid="41" wangid="0,1,0,2,0,1,0,1"/>
   <wangtile tileid="42" wangid="0,1,0,1,0,2,0,1"/>
  </wangset>
  <wangset name="grass" type="corner" tile="-1">
   <wangcolor name="grass" color="#ff0000" tile="-1" probability="1"/>
   <wangcolor name="mud" color="#00ff00" tile="-1" probability="1"/>
   <wangtile tileid="0" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="1" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="2" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="12" wangid="0,1,0,2,0,1,0,1"/>
   <wangtile tileid="13" wangid="0,1,0,2,0,2,0,1"/>
   <wangtile tileid="14" wangid="0,1,0,1,0,2,0,1"/>
   <wangtile tileid="24" wangid="0,2,0,2,0,1,0,1"/>
   <wangtile tileid="25" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="26" wangid="0,1,0,1,0,2,0,2"/>
   <wangtile tileid="36" wangid="0,2,0,1,0,1,0,1"/>
   <wangtile tileid="37" wangid="0,2,0,1,0,1,0,2"/>
   <wangtile tileid="38" wangid="0,1,0,1,0,1,0,2"/>
   <wangtile tileid="39" wangid="0,2,0,2,0,2,0,1"/>
   <wangtile tileid="40" wangid="0,1,0,2,0,2,0,2"/>
   <wangtile tileid="41" wangid="0,2,0,1,0,2,0,2"/>
   <wangtile tileid="42" wangid="0,2,0,2,0,1,0,2"/>
  </wangset>
  <wangset name="castle" type="mixed" tile="-1">
   <wangcolor name="castle" color="#ff0000" tile="-1" probability="1"/>
   <wangtile tileid="96" wangid="0,0,0,1,0,0,0,0"/>
   <wangtile tileid="97" wangid="0,0,0,1,1,1,0,0"/>
   <wangtile tileid="98" wangid="0,0,0,0,0,1,0,0"/>
   <wangtile tileid="99" wangid="0,0,1,0,0,0,0,0"/>
   <wangtile tileid="100" wangid="0,0,1,0,0,0,1,0"/>
   <wangtile tileid="101" wangid="0,0,0,0,0,0,1,0"/>
   <wangtile tileid="108" wangid="0,1,1,1,0,0,0,0"/>
   <wangtile tileid="109" wangid="1,1,1,1,1,1,1,1"/>
   <wangtile tileid="110" wangid="0,0,0,0,0,1,1,1"/>
   <wangtile tileid="120" wangid="0,1,0,0,0,0,0,0"/>
   <wangtile tileid="121" wangid="1,1,0,0,0,0,0,1"/>
   <wangtile tileid="122" wangid="0,0,0,0,0,0,0,1"/>
  </wangset>
 </wangsets>
</tileset>
