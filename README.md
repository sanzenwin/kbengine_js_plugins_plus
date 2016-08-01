# kbengine_js_plugins_plus
解决原kbengine js插件在win32平台下出现的分包问题
\n
# 使用
1.在jsList中加入此文件（位于"src/plugins/kbengine_js_plugins/kbengine.js"之后）
2.在cc.game.onStart 中替代KBEngine.create 为 :
KBEngine.init("127.0.0.1", 20013)
也可替代为：
var args = new KBEngine.KBEngineArgs();
args.ip = "127.0.0.1";
args.port = 20013;
KBEngine.init(args);
