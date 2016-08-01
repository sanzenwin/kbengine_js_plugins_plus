KBEngine.JSON_TYPE = {
	FIXED_DICT:{
		EVENT:['param'],
		MEMBER_CLIENT_DATA:['hall'],
	}
};

KBEngine.splicePackage = {};

KBEngine.DATATYPE_JSON = function(){
    KBEngine.DATATYPE_UNICODE.call(this);

    var super__createFromStream = this.createFromStream;
	this.createFromStream = function(stream){
		var value = super__createFromStream(stream);
        return JSON.parse(value);
	}

    var super__addToStream = this.addToStream;
	this.addToStream = function(stream, v){
        var value = JSON.stringify(v);
		super__addToStream(stream, value);
	}

	this.parseDefaultValStr = function(v){
		return JSON.stringify(v);
	}
	
	this.isSameType = function(v)
	{
		return typeof(v) == "object";
	}
};

KBEngine.init = function() {
	var args;
	if(arguments.length == 1){
		args = arguments[0];
	}else{
		args = new KBEngine.KBEngineArgs();
		args.ip = arguments[0];
		args.port = arguments[1];
	}
	KBEngine.create(args);

	var datatype_json = new KBEngine.DATATYPE_JSON();
	var onImportEntityDefCompleted = KBEngine.app.onImportEntityDefCompleted;
	KBEngine.app.onImportEntityDefCompleted = function(){
		for(var key in KBEngine.datatypes){
			var datatype = KBEngine.JSON_TYPE.FIXED_DICT[key];
			if(datatype){
				for(var i in datatype){
					KBEngine.datatypes[key].dicttype[datatype[i]] = datatype_json;
				}
			}
		}
		onImportEntityDefCompleted();
	};

    KBEngine.app.Client_onReLoginBaseappFailed = function() {
        KBEngine.INFO_MSG("KBEngineApp::Client_onReLoginBaseappFailed");
    };

	var Client_onImportClientMessages = KBEngine.app.Client_onImportClientMessages;
	KBEngine.app.Client_onImportClientMessages = function(msg)
	{
		var package = KBEngine.splicePackage['Client_onImportClientMessages'];
		if(package){
			var newData = mergeArrayBuffers(package.data, msg.data);
			if(newData.byteLength >= package.len){
				msg.data = newData;
				delete KBEngine.splicePackage['Client_onImportClientMessages'];
				return Client_onImportClientMessages(msg);
			}else{
				package.data = newData;
				return;
			}
		}
		var stream = new KBEngine.MemoryStream(msg.data);
		var msgid = stream.readUint16();
		if(msgid == KBEngine.messages.onImportClientMessages.id)
		{
			var msglen = stream.readUint16() + 4;
			if(msglen > msg.data.byteLength){
				KBEngine.splicePackage['Client_onImportClientMessages'] = {
					data:msg.data,
					len:msglen
				}
				return;
			}else{
				return Client_onImportClientMessages(msg);
			}
		}else{
			KBEngine.ERROR_MSG("KBEngineApp::onmessage: not found msg(" + msgid + ")!");
		}
	}

	KBEngine.app.onmessage = function(msg)
	{
		var package = KBEngine.splicePackage['onmessage'];
		if(package){
			msg.data = mergeArrayBuffers(package.data, msg.data);
		}
		var stream = new KBEngine.MemoryStream(msg.data);
		if(package){
			stream.rpos = package.rpos;
		}
		stream.wpos = msg.data.byteLength;
		
		while(stream.rpos < stream.wpos)
		{
			var msgid = stream.readUint16();
			var hasRead = 2;
			var msgHandler = KBEngine.clientmessages[msgid];
			
			if(!msgHandler)
			{
				KBEngine.ERROR_MSG("KBEngineApp::onmessage[" + KBEngine.app.currserver + "]: not found msg(" + msgid + ")!");
			}
			else
			{
				var msglen = msgHandler.length;
				if(msglen == -1)
				{
					msglen = stream.readUint16();
					hasRead += 2;
					// 扩展长度
					if(msglen == 65535){
						msglen = stream.readUint32();
						hasRead += 4;
					}
				}
				if(stream.rpos + msglen > stream.wpos){
					KBEngine.splicePackage['onmessage'] = {
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
		delete KBEngine.splicePackage['onmessage'];
	}  
};
