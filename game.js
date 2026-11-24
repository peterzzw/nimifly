// 主包：大厅壳 + 战斗核心。机库/测试机、关卡航图、机体图集各自走分包懒加载。
import './js/env';
import './js/sfx';
import './js/ms01Carrier';
import './js/airMine';
import './js/satellite';
// 飞机改走 WebGL 精灵批绘；主场景仍是 Canvas 2D。
import './js/render/webglWorld';
import './js/pkgLoader';
import './js/client';
