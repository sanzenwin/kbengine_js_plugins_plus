var utf8ArrayToString = function (array) {
    var result = '';
    for (var i = 0; i < array.length; ++i) {
        result += String.fromCharCode(array[i]);
    }
    return result;
};

var stringToUtf8Array = function (str) {
    var result = [];
    for (var i = 0; i < str.length; i++) {
        var charcode = str.charCodeAt(i);
        result.push(charcode);
    }
    return result;
};

function mergeArrayBuffers(buffer, buffer2) {
    var result = new Uint8Array(buffer.byteLength + buffer2.byteLength);
    result.set(new Uint8Array(buffer), 0);
    result.set(new Uint8Array(buffer2), buffer.byteLength);
    return result.buffer;
}

KBEngine.DATATYPE_PYTHON = function () {
    KBEngine.DATATYPE_BLOB.call(this);

    var intToString = function (v) {
        var result = '';
        for (var i = 0; i < 4; ++i) {
            result += String.fromCharCode((v >> (8 * i)) & 0xFF);
        }
        return result;
    };

    var JSON_stringify = function (s, emit_unicode) {
        var json = JSON.stringify(s);
        return emit_unicode ? json : json.replace(/[\u007f-\uffff]/g, function (c) {
            return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
        });
    };

    var createFromStream = this.createFromStream;
    this.createFromStream = function (stream) {
        var value = createFromStream.call(this, stream);
        value = utf8ArrayToString(value);
        value = value.slice(7, value.length - 3);
        return JSON.parse(value);
    };

    var addToStream = this.addToStream;
    this.addToStream = function (stream, v) {
        var value = JSON_stringify(v, false);
        value = '\x80\x03X' + intToString(value.length) + value + 'q\x00.';
        value = stringToUtf8Array(value);
        addToStream.call(this, stream, value);
    }

    this.parseDefaultValStr = function (v) {
        return JSON.stringify(v);
    }

    this.isSameType = function (v) {
        return typeof(v) == "object";
    }
};
KBEngine.datatypes["PYTHON"] = new KBEngine.DATATYPE_PYTHON();

KBEngine.int = new function () {
    this.__to = function (x, type) {
        var lo = x >> 32;
        var hi = Math.max((x - Math.pow(2, 32) - lo) / Math.pow(2, 32), 0);
        return new type(lo, hi);
    };
    this.to64 = function (x) {
        var int64 = new Int64(x).getHiLo();
        return new KBEngine.INT64(int64.lo, int64.hi);
    };
    this.toU64 = function (x) {
        var int64 = new Int64(x).getHiLo();
        return new KBEngine.UINT64(int64.lo, int64.hi);
    };
    this.toUInt = function (x) {
        return this.toInt(x);
    };
    this.toInt = function (x) {
        if (this.is64(x)) {
            return new Int64(x.hi, x.lo).valueOf();
        } else {
            return parseInt(x);
        }
    };
    this.isEqual = function (x, y) {
        if (this.is64(x))
            return x.hi == y.hi && x.lo == y.lo;
        else
            return x == y;
    };
    this.is64 = function (x) {
        return x instanceof KBEngine.INT64 || x instanceof KBEngine.UINT64;
    }
};

KBEngine.__create = KBEngine.create;
KBEngine.create = function (args) {
    // console.assert(KBEngine.app.clientVersion == "1.1.5", "clientVersion does not match");
    KBEngine.__create(args);

    var splicePackage = {};

    var Client_onImportClientMessages = KBEngine.app.Client_onImportClientMessages;
    KBEngine.app.Client_onImportClientMessages = function (msg) {
        var package = splicePackage['Client_onImportClientMessages'];
        if (package) {
            var newData = mergeArrayBuffers(package.data, msg.data);
            if (newData.byteLength >= package.len) {
                msg.data = newData;
                delete splicePackage['Client_onImportClientMessages'];
                return Client_onImportClientMessages.call(this, msg);
            } else {
                package.data = newData;
                return;
            }
        }
        var stream = new KBEngine.MemoryStream(msg.data);
        var msgid = stream.readUint16();
        if (msgid == KBEngine.messages.onImportClientMessages.id) {
            var msglen = stream.readUint16() + 4;
            if (msglen > msg.data.byteLength) {
                splicePackage['Client_onImportClientMessages'] = {
                    data: msg.data,
                    len: msglen
                }
                return;
            } else {
                return Client_onImportClientMessages.call(this, msg);
            }
        } else {
            KBEngine.ERROR_MSG("KBEngineApp::onmessage: not found msg(" + msgid + ")!");
        }
    }

    KBEngine.app.onmessage = function (msg) {
        var package = splicePackage['onmessage'];
        if (package) {
            msg.data = mergeArrayBuffers(package.data, msg.data);
        }
        var stream = new KBEngine.MemoryStream(msg.data);
        if (package) {
            stream.rpos = package.rpos;
        }
        stream.wpos = msg.data.byteLength;

        while (stream.rpos < stream.wpos) {
            var msgid = stream.readUint16();
            var hasRead = 2;
            var msgHandler = KBEngine.clientmessages[msgid];

            if (!msgHandler) {
                KBEngine.ERROR_MSG("KBEngineApp::onmessage[" + KBEngine.app.currserver + "]: not found msg(" + msgid + ")!");
            }
            else {
                var msglen = msgHandler.length;
                if (msglen == -1) {
                    msglen = stream.readUint16();
                    hasRead += 2;
                    // 扩展长度
                    if (msglen == 65535) {
                        msglen = stream.readUint32();
                        hasRead += 4;
                    }
                }
                if (stream.rpos + msglen > stream.wpos) {
                    splicePackage['onmessage'] = {
                        data: msg.data,
                        rpos: stream.rpos - hasRead
                    }
                    return;
                }
                var wpos = stream.wpos;
                var rpos = stream.rpos + msglen;
                stream.wpos = rpos;
                msgHandler.handleMessage(stream);
                stream.wpos = wpos;
                stream.rpos = rpos;
            }
        }
        delete splicePackage['onmessage'];
    };

    var Client_onCreatedProxies = KBEngine.app.Client_onCreatedProxies;
    KBEngine.app.Client_onCreatedProxies = function (rndUUID, eid, entityType) {
        var entity = KBEngine.app.entities[eid];
        Client_onCreatedProxies.call(this, rndUUID, eid, entityType);
        if (entity != undefined) {
            KBEngine.Event.fire("onReloginBaseappSuccessfully", entity);
        }
    };

    KBEngine.app.Client_onReloginBaseappFailed = function (failedcode) {
        KBEngine.Event.fire("onReloginBaseappFailed", failedcode);
    };

    var KBEngine_app_connect = KBEngine.app.connect;
    KBEngine.app.connect = function () {
        this.disconnect();
        KBEngine_app_connect.apply(this, arguments);
    };

    KBEngine.app.Client_onCreateAccountResult = function (stream) {
        var retcode = stream.readUint16();
        var datas = stream.readBlob();
        if (retcode != 0) {
            KBEngine.ERROR_MSG("KBEngineApp::Client_onCreateAccountResult: " + KBEngine.app.username + " create is failed! code=" + KBEngine.app.serverErrs[retcode].name + "!");
        } else {
            KBEngine.INFO_MSG("KBEngineApp::Client_onCreateAccountResult: " + KBEngine.app.username + " create is successfully!");
        }
        KBEngine.Event.fire("onCreateAccountResult", retcode, datas);
    };
};
