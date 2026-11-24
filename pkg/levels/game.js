/**
 * 关卡分包入口（航图 UI）
 * 主包 wx.loadSubpackage({ name: "levels" }) 成功后再 require 本文件
 * 不进航图不下载，避免拖慢冷启动
 */
require("./levels.js");
