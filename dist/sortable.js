(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * interact.js v1.2.6
 *
 * Copyright (c) 2012-2015 Taye Adeyemi <dev@taye.me>
 * Open source under the MIT License.
 * https://raw.github.com/taye/interact.js/master/LICENSE
 */
(function (realWindow) {
    'use strict';

    // return early if there's no window to work with (eg. Node.js)
    if (!realWindow) { return; }

    var // get wrapped window if using Shadow DOM polyfill
        window = (function () {
            // create a TextNode
            var el = realWindow.document.createTextNode('');

            // check if it's wrapped by a polyfill
            if (el.ownerDocument !== realWindow.document
                && typeof realWindow.wrap === 'function'
                && realWindow.wrap(el) === el) {
                // return wrapped window
                return realWindow.wrap(realWindow);
            }

            // no Shadow DOM polyfil or native implementation
            return realWindow;
        }()),

        document           = window.document,
        DocumentFragment   = window.DocumentFragment   || blank,
        SVGElement         = window.SVGElement         || blank,
        SVGSVGElement      = window.SVGSVGElement      || blank,
        SVGElementInstance = window.SVGElementInstance || blank,
        HTMLElement        = window.HTMLElement        || window.Element,

        PointerEvent = (window.PointerEvent || window.MSPointerEvent),
        pEventTypes,

        hypot = Math.hypot || function (x, y) { return Math.sqrt(x * x + y * y); },

        tmpXY = {},     // reduce object creation in getXY()

        documents       = [],   // all documents being listened to

        interactables   = [],   // all set interactables
        interactions    = [],   // all interactions

        dynamicDrop     = false,

        // {
        //      type: {
        //          selectors: ['selector', ...],
        //          contexts : [document, ...],
        //          listeners: [[listener, useCapture], ...]
        //      }
        //  }
        delegatedEvents = {},

        defaultOptions = {
            base: {
                accept        : null,
                actionChecker : null,
                styleCursor   : true,
                preventDefault: 'auto',
                origin        : { x: 0, y: 0 },
                deltaSource   : 'page',
                allowFrom     : null,
                ignoreFrom    : null,
                _context      : document,
                dropChecker   : null
            },

            drag: {
                enabled: false,
                manualStart: true,
                max: Infinity,
                maxPerElement: 1,

                snap: null,
                restrict: null,
                inertia: null,
                autoScroll: null,

                axis: 'xy'
            },

            drop: {
                enabled: false,
                accept: null,
                overlap: 'pointer'
            },

            resize: {
                enabled: false,
                manualStart: false,
                max: Infinity,
                maxPerElement: 1,

                snap: null,
                restrict: null,
                inertia: null,
                autoScroll: null,

                square: false,
                preserveAspectRatio: false,
                axis: 'xy',

                // use default margin
                margin: NaN,

                // object with props left, right, top, bottom which are
                // true/false values to resize when the pointer is over that edge,
                // CSS selectors to match the handles for each direction
                // or the Elements for each handle
                edges: null,

                // a value of 'none' will limit the resize rect to a minimum of 0x0
                // 'negate' will alow the rect to have negative width/height
                // 'reposition' will keep the width/height positive by swapping
                // the top and bottom edges and/or swapping the left and right edges
                invert: 'none'
            },

            gesture: {
                manualStart: false,
                enabled: false,
                max: Infinity,
                maxPerElement: 1,

                restrict: null
            },

            perAction: {
                manualStart: false,
                max: Infinity,
                maxPerElement: 1,

                snap: {
                    enabled     : false,
                    endOnly     : false,
                    range       : Infinity,
                    targets     : null,
                    offsets     : null,

                    relativePoints: null
                },

                restrict: {
                    enabled: false,
                    endOnly: false
                },

                autoScroll: {
                    enabled     : false,
                    container   : null,     // the item that is scrolled (Window or HTMLElement)
                    margin      : 60,
                    speed       : 300       // the scroll speed in pixels per second
                },

                inertia: {
                    enabled          : false,
                    resistance       : 10,    // the lambda in exponential decay
                    minSpeed         : 100,   // target speed must be above this for inertia to start
                    endSpeed         : 10,    // the speed at which inertia is slow enough to stop
                    allowResume      : true,  // allow resuming an action in inertia phase
                    zeroResumeDelta  : true,  // if an action is resumed after launch, set dx/dy to 0
                    smoothEndDuration: 300    // animate to snap/restrict endOnly if there's no inertia
                }
            },

            _holdDuration: 600
        },

        // Things related to autoScroll
        autoScroll = {
            interaction: null,
            i: null,    // the handle returned by window.setInterval
            x: 0, y: 0, // Direction each pulse is to scroll in

            // scroll the window by the values in scroll.x/y
            scroll: function () {
                var options = autoScroll.interaction.target.options[autoScroll.interaction.prepared.name].autoScroll,
                    container = options.container || getWindow(autoScroll.interaction.element),
                    now = new Date().getTime(),
                    // change in time in seconds
                    dtx = (now - autoScroll.prevTimeX) / 1000,
                    dty = (now - autoScroll.prevTimeY) / 1000,
                    vx, vy, sx, sy;

                // displacement
                if (options.velocity) {
                  vx = options.velocity.x;
                  vy = options.velocity.y;
                }
                else {
                  vx = vy = options.speed
                }
 
                sx = vx * dtx;
                sy = vy * dty;

                if (sx >= 1 || sy >= 1) {
                    if (isWindow(container)) {
                        container.scrollBy(autoScroll.x * sx, autoScroll.y * sy);
                    }
                    else if (container) {
                        container.scrollLeft += autoScroll.x * sx;
                        container.scrollTop  += autoScroll.y * sy;
                    }

                    if (sx >=1) autoScroll.prevTimeX = now;
                    if (sy >= 1) autoScroll.prevTimeY = now;
                }

                if (autoScroll.isScrolling) {
                    cancelFrame(autoScroll.i);
                    autoScroll.i = reqFrame(autoScroll.scroll);
                }
            },

            isScrolling: false,
            prevTimeX: 0,
            prevTimeY: 0,

            start: function (interaction) {
                autoScroll.isScrolling = true;
                cancelFrame(autoScroll.i);

                autoScroll.interaction = interaction;
                autoScroll.prevTimeX = new Date().getTime();
                autoScroll.prevTimeY = new Date().getTime();
                autoScroll.i = reqFrame(autoScroll.scroll);
            },

            stop: function () {
                autoScroll.isScrolling = false;
                cancelFrame(autoScroll.i);
            }
        },

        // Does the browser support touch input?
        supportsTouch = (('ontouchstart' in window) || window.DocumentTouch && document instanceof window.DocumentTouch),

        // Does the browser support PointerEvents
        supportsPointerEvent = !!PointerEvent,

        // Less Precision with touch input
        margin = supportsTouch || supportsPointerEvent? 20: 10,

        pointerMoveTolerance = 1,

        // for ignoring browser's simulated mouse events
        prevTouchTime = 0,

        // Allow this many interactions to happen simultaneously
        maxInteractions = Infinity,

        // Check if is IE9 or older
        actionCursors = (document.all && !window.atob) ? {
            drag    : 'move',
            resizex : 'e-resize',
            resizey : 's-resize',
            resizexy: 'se-resize',

            resizetop        : 'n-resize',
            resizeleft       : 'w-resize',
            resizebottom     : 's-resize',
            resizeright      : 'e-resize',
            resizetopleft    : 'se-resize',
            resizebottomright: 'se-resize',
            resizetopright   : 'ne-resize',
            resizebottomleft : 'ne-resize',

            gesture : ''
        } : {
            drag    : 'move',
            resizex : 'ew-resize',
            resizey : 'ns-resize',
            resizexy: 'nwse-resize',

            resizetop        : 'ns-resize',
            resizeleft       : 'ew-resize',
            resizebottom     : 'ns-resize',
            resizeright      : 'ew-resize',
            resizetopleft    : 'nwse-resize',
            resizebottomright: 'nwse-resize',
            resizetopright   : 'nesw-resize',
            resizebottomleft : 'nesw-resize',

            gesture : ''
        },

        actionIsEnabled = {
            drag   : true,
            resize : true,
            gesture: true
        },

        // because Webkit and Opera still use 'mousewheel' event type
        wheelEvent = 'onmousewheel' in document? 'mousewheel': 'wheel',

        eventTypes = [
            'dragstart',
            'dragmove',
            'draginertiastart',
            'dragend',
            'dragenter',
            'dragleave',
            'dropactivate',
            'dropdeactivate',
            'dropmove',
            'drop',
            'resizestart',
            'resizemove',
            'resizeinertiastart',
            'resizeend',
            'gesturestart',
            'gesturemove',
            'gestureinertiastart',
            'gestureend',

            'down',
            'move',
            'up',
            'cancel',
            'tap',
            'doubletap',
            'hold'
        ],

        globalEvents = {},

        // Opera Mobile must be handled differently
        isOperaMobile = navigator.appName == 'Opera' &&
            supportsTouch &&
            navigator.userAgent.match('Presto'),

        // scrolling doesn't change the result of getClientRects on iOS 7
        isIOS7 = (/iP(hone|od|ad)/.test(navigator.platform)
                         && /OS 7[^\d]/.test(navigator.appVersion)),

        // prefix matchesSelector
        prefixedMatchesSelector = 'matches' in Element.prototype?
                'matches': 'webkitMatchesSelector' in Element.prototype?
                    'webkitMatchesSelector': 'mozMatchesSelector' in Element.prototype?
                        'mozMatchesSelector': 'oMatchesSelector' in Element.prototype?
                            'oMatchesSelector': 'msMatchesSelector',

        // will be polyfill function if browser is IE8
        ie8MatchesSelector,

        // native requestAnimationFrame or polyfill
        reqFrame = realWindow.requestAnimationFrame,
        cancelFrame = realWindow.cancelAnimationFrame,

        // Events wrapper
        events = (function () {
            var useAttachEvent = ('attachEvent' in window) && !('addEventListener' in window),
                addEvent       = useAttachEvent?  'attachEvent': 'addEventListener',
                removeEvent    = useAttachEvent?  'detachEvent': 'removeEventListener',
                on             = useAttachEvent? 'on': '',

                elements          = [],
                targets           = [],
                attachedListeners = [];

            function add (element, type, listener, useCapture) {
                var elementIndex = indexOf(elements, element),
                    target = targets[elementIndex];

                if (!target) {
                    target = {
                        events: {},
                        typeCount: 0
                    };

                    elementIndex = elements.push(element) - 1;
                    targets.push(target);

                    attachedListeners.push((useAttachEvent ? {
                            supplied: [],
                            wrapped : [],
                            useCount: []
                        } : null));
                }

                if (!target.events[type]) {
                    target.events[type] = [];
                    target.typeCount++;
                }

                if (!contains(target.events[type], listener)) {
                    var ret;

                    if (useAttachEvent) {
                        var listeners = attachedListeners[elementIndex],
                            listenerIndex = indexOf(listeners.supplied, listener);

                        var wrapped = listeners.wrapped[listenerIndex] || function (event) {
                            if (!event.immediatePropagationStopped) {
                                event.target = event.srcElement;
                                event.currentTarget = element;

                                event.preventDefault = event.preventDefault || preventDef;
                                event.stopPropagation = event.stopPropagation || stopProp;
                                event.stopImmediatePropagation = event.stopImmediatePropagation || stopImmProp;

                                if (/mouse|click/.test(event.type)) {
                                    event.pageX = event.clientX + getWindow(element).document.documentElement.scrollLeft;
                                    event.pageY = event.clientY + getWindow(element).document.documentElement.scrollTop;
                                }

                                listener(event);
                            }
                        };

                        ret = element[addEvent](on + type, wrapped, Boolean(useCapture));

                        if (listenerIndex === -1) {
                            listeners.supplied.push(listener);
                            listeners.wrapped.push(wrapped);
                            listeners.useCount.push(1);
                        }
                        else {
                            listeners.useCount[listenerIndex]++;
                        }
                    }
                    else {
                        ret = element[addEvent](type, listener, useCapture || false);
                    }
                    target.events[type].push(listener);

                    return ret;
                }
            }

            function remove (element, type, listener, useCapture) {
                var i,
                    elementIndex = indexOf(elements, element),
                    target = targets[elementIndex],
                    listeners,
                    listenerIndex,
                    wrapped = listener;

                if (!target || !target.events) {
                    return;
                }

                if (useAttachEvent) {
                    listeners = attachedListeners[elementIndex];
                    listenerIndex = indexOf(listeners.supplied, listener);
                    wrapped = listeners.wrapped[listenerIndex];
                }

                if (type === 'all') {
                    for (type in target.events) {
                        if (target.events.hasOwnProperty(type)) {
                            remove(element, type, 'all');
                        }
                    }
                    return;
                }

                if (target.events[type]) {
                    var len = target.events[type].length;

                    if (listener === 'all') {
                        for (i = 0; i < len; i++) {
                            remove(element, type, target.events[type][i], Boolean(useCapture));
                        }
                        return;
                    } else {
                        for (i = 0; i < len; i++) {
                            if (target.events[type][i] === listener) {
                                element[removeEvent](on + type, wrapped, useCapture || false);
                                target.events[type].splice(i, 1);

                                if (useAttachEvent && listeners) {
                                    listeners.useCount[listenerIndex]--;
                                    if (listeners.useCount[listenerIndex] === 0) {
                                        listeners.supplied.splice(listenerIndex, 1);
                                        listeners.wrapped.splice(listenerIndex, 1);
                                        listeners.useCount.splice(listenerIndex, 1);
                                    }
                                }

                                break;
                            }
                        }
                    }

                    if (target.events[type] && target.events[type].length === 0) {
                        target.events[type] = null;
                        target.typeCount--;
                    }
                }

                if (!target.typeCount) {
                    targets.splice(elementIndex, 1);
                    elements.splice(elementIndex, 1);
                    attachedListeners.splice(elementIndex, 1);
                }
            }

            function preventDef () {
                this.returnValue = false;
            }

            function stopProp () {
                this.cancelBubble = true;
            }

            function stopImmProp () {
                this.cancelBubble = true;
                this.immediatePropagationStopped = true;
            }

            return {
                add: add,
                remove: remove,
                useAttachEvent: useAttachEvent,

                _elements: elements,
                _targets: targets,
                _attachedListeners: attachedListeners
            };
        }());

    function blank () {}

    function isElement (o) {
        if (!o || (typeof o !== 'object')) { return false; }

        var _window = getWindow(o) || window;

        return (/object|function/.test(typeof _window.Element)
            ? o instanceof _window.Element //DOM2
            : o.nodeType === 1 && typeof o.nodeName === "string");
    }
    function isWindow (thing) { return thing === window || !!(thing && thing.Window) && (thing instanceof thing.Window); }
    function isDocFrag (thing) { return !!thing && thing instanceof DocumentFragment; }
    function isArray (thing) {
        return isObject(thing)
                && (typeof thing.length !== undefined)
                && isFunction(thing.splice);
    }
    function isObject   (thing) { return !!thing && (typeof thing === 'object'); }
    function isFunction (thing) { return typeof thing === 'function'; }
    function isNumber   (thing) { return typeof thing === 'number'  ; }
    function isBool     (thing) { return typeof thing === 'boolean' ; }
    function isString   (thing) { return typeof thing === 'string'  ; }

    function trySelector (value) {
        if (!isString(value)) { return false; }

        // an exception will be raised if it is invalid
        document.querySelector(value);
        return true;
    }

    function extend (dest, source) {
        for (var prop in source) {
            dest[prop] = source[prop];
        }
        return dest;
    }

    var prefixedPropREs = {
      webkit: /(Movement[XY]|Radius[XY]|RotationAngle|Force)$/
    };

    function pointerExtend (dest, source) {
        for (var prop in source) {
          var deprecated = false;

          // skip deprecated prefixed properties
          for (var vendor in prefixedPropREs) {
            if (prop.indexOf(vendor) === 0 && prefixedPropREs[vendor].test(prop)) {
              deprecated = true;
              break;
            }
          }

          if (!deprecated) {
            dest[prop] = source[prop];
          }
        }
        return dest;
    }

    function copyCoords (dest, src) {
        dest.page = dest.page || {};
        dest.page.x = src.page.x;
        dest.page.y = src.page.y;

        dest.client = dest.client || {};
        dest.client.x = src.client.x;
        dest.client.y = src.client.y;

        dest.timeStamp = src.timeStamp;
    }

    function setEventXY (targetObj, pointers, interaction) {
        var pointer = (pointers.length > 1
                       ? pointerAverage(pointers)
                       : pointers[0]);

        getPageXY(pointer, tmpXY, interaction);
        targetObj.page.x = tmpXY.x;
        targetObj.page.y = tmpXY.y;

        getClientXY(pointer, tmpXY, interaction);
        targetObj.client.x = tmpXY.x;
        targetObj.client.y = tmpXY.y;

        targetObj.timeStamp = new Date().getTime();
    }

    function setEventDeltas (targetObj, prev, cur) {
        targetObj.page.x     = cur.page.x      - prev.page.x;
        targetObj.page.y     = cur.page.y      - prev.page.y;
        targetObj.client.x   = cur.client.x    - prev.client.x;
        targetObj.client.y   = cur.client.y    - prev.client.y;
        targetObj.timeStamp = new Date().getTime() - prev.timeStamp;

        // set pointer velocity
        var dt = Math.max(targetObj.timeStamp / 1000, 0.001);
        targetObj.page.speed   = hypot(targetObj.page.x, targetObj.page.y) / dt;
        targetObj.page.vx      = targetObj.page.x / dt;
        targetObj.page.vy      = targetObj.page.y / dt;

        targetObj.client.speed = hypot(targetObj.client.x, targetObj.page.y) / dt;
        targetObj.client.vx    = targetObj.client.x / dt;
        targetObj.client.vy    = targetObj.client.y / dt;
    }

    function isNativePointer (pointer) {
        return (pointer instanceof window.Event
            || (supportsTouch && window.Touch && pointer instanceof window.Touch));
    }

    // Get specified X/Y coords for mouse or event.touches[0]
    function getXY (type, pointer, xy) {
        xy = xy || {};
        type = type || 'page';

        xy.x = pointer[type + 'X'];
        xy.y = pointer[type + 'Y'];

        return xy;
    }

    function getPageXY (pointer, page) {
        page = page || {};

        // Opera Mobile handles the viewport and scrolling oddly
        if (isOperaMobile && isNativePointer(pointer)) {
            getXY('screen', pointer, page);

            page.x += window.scrollX;
            page.y += window.scrollY;
        }
        else {
            getXY('page', pointer, page);
        }

        return page;
    }

    function getClientXY (pointer, client) {
        client = client || {};

        if (isOperaMobile && isNativePointer(pointer)) {
            // Opera Mobile handles the viewport and scrolling oddly
            getXY('screen', pointer, client);
        }
        else {
          getXY('client', pointer, client);
        }

        return client;
    }

    function getScrollXY (win) {
        win = win || window;
        return {
            x: win.scrollX || win.document.documentElement.scrollLeft,
            y: win.scrollY || win.document.documentElement.scrollTop
        };
    }

    function getPointerId (pointer) {
        return isNumber(pointer.pointerId)? pointer.pointerId : pointer.identifier;
    }

    function getActualElement (element) {
        return (element instanceof SVGElementInstance
            ? element.correspondingUseElement
            : element);
    }

    function getWindow (node) {
        if (isWindow(node)) {
            return node;
        }

        var rootNode = (node.ownerDocument || node);

        return rootNode.defaultView || rootNode.parentWindow || window;
    }

    function getElementClientRect (element) {
        var clientRect = (element instanceof SVGElement
                            ? element.getBoundingClientRect()
                            : element.getClientRects()[0]);

        return clientRect && {
            left  : clientRect.left,
            right : clientRect.right,
            top   : clientRect.top,
            bottom: clientRect.bottom,
            width : clientRect.width || clientRect.right - clientRect.left,
            height: clientRect.height || clientRect.bottom - clientRect.top
        };
    }

    function getElementRect (element) {
        var clientRect = getElementClientRect(element);

        if (!isIOS7 && clientRect) {
            var scroll = getScrollXY(getWindow(element));

            clientRect.left   += scroll.x;
            clientRect.right  += scroll.x;
            clientRect.top    += scroll.y;
            clientRect.bottom += scroll.y;
        }

        return clientRect;
    }

    function getTouchPair (event) {
        var touches = [];

        // array of touches is supplied
        if (isArray(event)) {
            touches[0] = event[0];
            touches[1] = event[1];
        }
        // an event
        else {
            if (event.type === 'touchend') {
                if (event.touches.length === 1) {
                    touches[0] = event.touches[0];
                    touches[1] = event.changedTouches[0];
                }
                else if (event.touches.length === 0) {
                    touches[0] = event.changedTouches[0];
                    touches[1] = event.changedTouches[1];
                }
            }
            else {
                touches[0] = event.touches[0];
                touches[1] = event.touches[1];
            }
        }

        return touches;
    }

    function pointerAverage (pointers) {
        var average = {
            pageX  : 0,
            pageY  : 0,
            clientX: 0,
            clientY: 0,
            screenX: 0,
            screenY: 0
        };
        var prop;

        for (var i = 0; i < pointers.length; i++) {
            for (prop in average) {
                average[prop] += pointers[i][prop];
            }
        }
        for (prop in average) {
            average[prop] /= pointers.length;
        }

        return average;
    }

    function touchBBox (event) {
        if (!event.length && !(event.touches && event.touches.length > 1)) {
            return;
        }

        var touches = getTouchPair(event),
            minX = Math.min(touches[0].pageX, touches[1].pageX),
            minY = Math.min(touches[0].pageY, touches[1].pageY),
            maxX = Math.max(touches[0].pageX, touches[1].pageX),
            maxY = Math.max(touches[0].pageY, touches[1].pageY);

        return {
            x: minX,
            y: minY,
            left: minX,
            top: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    function touchDistance (event, deltaSource) {
        deltaSource = deltaSource || defaultOptions.deltaSource;

        var sourceX = deltaSource + 'X',
            sourceY = deltaSource + 'Y',
            touches = getTouchPair(event);


        var dx = touches[0][sourceX] - touches[1][sourceX],
            dy = touches[0][sourceY] - touches[1][sourceY];

        return hypot(dx, dy);
    }

    function touchAngle (event, prevAngle, deltaSource) {
        deltaSource = deltaSource || defaultOptions.deltaSource;

        var sourceX = deltaSource + 'X',
            sourceY = deltaSource + 'Y',
            touches = getTouchPair(event),
            dx = touches[0][sourceX] - touches[1][sourceX],
            dy = touches[0][sourceY] - touches[1][sourceY],
            angle = 180 * Math.atan(dy / dx) / Math.PI;

        if (isNumber(prevAngle)) {
            var dr = angle - prevAngle,
                drClamped = dr % 360;

            if (drClamped > 315) {
                angle -= 360 + (angle / 360)|0 * 360;
            }
            else if (drClamped > 135) {
                angle -= 180 + (angle / 360)|0 * 360;
            }
            else if (drClamped < -315) {
                angle += 360 + (angle / 360)|0 * 360;
            }
            else if (drClamped < -135) {
                angle += 180 + (angle / 360)|0 * 360;
            }
        }

        return  angle;
    }

    function getOriginXY (interactable, element) {
        var origin = interactable
                ? interactable.options.origin
                : defaultOptions.origin;

        if (origin === 'parent') {
            origin = parentElement(element);
        }
        else if (origin === 'self') {
            origin = interactable.getRect(element);
        }
        else if (trySelector(origin)) {
            origin = closest(element, origin) || { x: 0, y: 0 };
        }

        if (isFunction(origin)) {
            origin = origin(interactable && element);
        }

        if (isElement(origin))  {
            origin = getElementRect(origin);
        }

        origin.x = ('x' in origin)? origin.x : origin.left;
        origin.y = ('y' in origin)? origin.y : origin.top;

        return origin;
    }

    // http://stackoverflow.com/a/5634528/2280888
    function _getQBezierValue(t, p1, p2, p3) {
        var iT = 1 - t;
        return iT * iT * p1 + 2 * iT * t * p2 + t * t * p3;
    }

    function getQuadraticCurvePoint(startX, startY, cpX, cpY, endX, endY, position) {
        return {
            x:  _getQBezierValue(position, startX, cpX, endX),
            y:  _getQBezierValue(position, startY, cpY, endY)
        };
    }

    // http://gizma.com/easing/
    function easeOutQuad (t, b, c, d) {
        t /= d;
        return -c * t*(t-2) + b;
    }

    function nodeContains (parent, child) {
        while (child) {
            if (child === parent) {
                return true;
            }

            child = child.parentNode;
        }

        return false;
    }

    function closest (child, selector) {
        var parent = parentElement(child);

        while (isElement(parent)) {
            if (matchesSelector(parent, selector)) { return parent; }

            parent = parentElement(parent);
        }

        return null;
    }

    function parentElement (node) {
        var parent = node.parentNode;

        if (isDocFrag(parent)) {
            // skip past #shado-root fragments
            while ((parent = parent.host) && isDocFrag(parent)) {}

            return parent;
        }

        return parent;
    }

    function inContext (interactable, element) {
        return interactable._context === element.ownerDocument
                || nodeContains(interactable._context, element);
    }

    function testIgnore (interactable, interactableElement, element) {
        var ignoreFrom = interactable.options.ignoreFrom;

        if (!ignoreFrom || !isElement(element)) { return false; }

        if (isString(ignoreFrom)) {
            return matchesUpTo(element, ignoreFrom, interactableElement);
        }
        else if (isElement(ignoreFrom)) {
            return nodeContains(ignoreFrom, element);
        }

        return false;
    }

    function testAllow (interactable, interactableElement, element) {
        var allowFrom = interactable.options.allowFrom;

        if (!allowFrom) { return true; }

        if (!isElement(element)) { return false; }

        if (isString(allowFrom)) {
            return matchesUpTo(element, allowFrom, interactableElement);
        }
        else if (isElement(allowFrom)) {
            return nodeContains(allowFrom, element);
        }

        return false;
    }

    function checkAxis (axis, interactable) {
        if (!interactable) { return false; }

        var thisAxis = interactable.options.drag.axis;

        return (axis === 'xy' || thisAxis === 'xy' || thisAxis === axis);
    }

    function checkSnap (interactable, action) {
        var options = interactable.options;

        if (/^resize/.test(action)) {
            action = 'resize';
        }

        return options[action].snap && options[action].snap.enabled;
    }

    function checkRestrict (interactable, action) {
        var options = interactable.options;

        if (/^resize/.test(action)) {
            action = 'resize';
        }

        return  options[action].restrict && options[action].restrict.enabled;
    }

    function checkAutoScroll (interactable, action) {
        var options = interactable.options;

        if (/^resize/.test(action)) {
            action = 'resize';
        }

        return  options[action].autoScroll && options[action].autoScroll.enabled;
    }

    function withinInteractionLimit (interactable, element, action) {
        var options = interactable.options,
            maxActions = options[action.name].max,
            maxPerElement = options[action.name].maxPerElement,
            activeInteractions = 0,
            targetCount = 0,
            targetElementCount = 0;

        for (var i = 0, len = interactions.length; i < len; i++) {
            var interaction = interactions[i],
                otherAction = interaction.prepared.name,
                active = interaction.interacting();

            if (!active) { continue; }

            activeInteractions++;

            if (activeInteractions >= maxInteractions) {
                return false;
            }

            if (interaction.target !== interactable) { continue; }

            targetCount += (otherAction === action.name)|0;

            if (targetCount >= maxActions) {
                return false;
            }

            if (interaction.element === element) {
                targetElementCount++;

                if (otherAction !== action.name || targetElementCount >= maxPerElement) {
                    return false;
                }
            }
        }

        return maxInteractions > 0;
    }

    // Test for the element that's "above" all other qualifiers
    function indexOfDeepestElement (elements) {
        var dropzone,
            deepestZone = elements[0],
            index = deepestZone? 0: -1,
            parent,
            deepestZoneParents = [],
            dropzoneParents = [],
            child,
            i,
            n;

        for (i = 1; i < elements.length; i++) {
            dropzone = elements[i];

            // an element might belong to multiple selector dropzones
            if (!dropzone || dropzone === deepestZone) {
                continue;
            }

            if (!deepestZone) {
                deepestZone = dropzone;
                index = i;
                continue;
            }

            // check if the deepest or current are document.documentElement or document.rootElement
            // - if the current dropzone is, do nothing and continue
            if (dropzone.parentNode === dropzone.ownerDocument) {
                continue;
            }
            // - if deepest is, update with the current dropzone and continue to next
            else if (deepestZone.parentNode === dropzone.ownerDocument) {
                deepestZone = dropzone;
                index = i;
                continue;
            }

            if (!deepestZoneParents.length) {
                parent = deepestZone;
                while (parent.parentNode && parent.parentNode !== parent.ownerDocument) {
                    deepestZoneParents.unshift(parent);
                    parent = parent.parentNode;
                }
            }

            // if this element is an svg element and the current deepest is
            // an HTMLElement
            if (deepestZone instanceof HTMLElement
                && dropzone instanceof SVGElement
                && !(dropzone instanceof SVGSVGElement)) {

                if (dropzone === deepestZone.parentNode) {
                    continue;
                }

                parent = dropzone.ownerSVGElement;
            }
            else {
                parent = dropzone;
            }

            dropzoneParents = [];

            while (parent.parentNode !== parent.ownerDocument) {
                dropzoneParents.unshift(parent);
                parent = parent.parentNode;
            }

            n = 0;

            // get (position of last common ancestor) + 1
            while (dropzoneParents[n] && dropzoneParents[n] === deepestZoneParents[n]) {
                n++;
            }

            var parents = [
                dropzoneParents[n - 1],
                dropzoneParents[n],
                deepestZoneParents[n]
            ];

            child = parents[0].lastChild;

            while (child) {
                if (child === parents[1]) {
                    deepestZone = dropzone;
                    index = i;
                    deepestZoneParents = [];

                    break;
                }
                else if (child === parents[2]) {
                    break;
                }

                child = child.previousSibling;
            }
        }

        return index;
    }

    function Interaction () {
        this.target          = null; // current interactable being interacted with
        this.element         = null; // the target element of the interactable
        this.dropTarget      = null; // the dropzone a drag target might be dropped into
        this.dropElement     = null; // the element at the time of checking
        this.prevDropTarget  = null; // the dropzone that was recently dragged away from
        this.prevDropElement = null; // the element at the time of checking

        this.prepared        = {     // action that's ready to be fired on next move event
            name : null,
            axis : null,
            edges: null
        };

        this.matches         = [];   // all selectors that are matched by target element
        this.matchElements   = [];   // corresponding elements

        this.inertiaStatus = {
            active       : false,
            smoothEnd    : false,
            ending       : false,

            startEvent: null,
            upCoords: {},

            xe: 0, ye: 0,
            sx: 0, sy: 0,

            t0: 0,
            vx0: 0, vys: 0,
            duration: 0,

            resumeDx: 0,
            resumeDy: 0,

            lambda_v0: 0,
            one_ve_v0: 0,
            i  : null
        };

        if (isFunction(Function.prototype.bind)) {
            this.boundInertiaFrame = this.inertiaFrame.bind(this);
            this.boundSmoothEndFrame = this.smoothEndFrame.bind(this);
        }
        else {
            var that = this;

            this.boundInertiaFrame = function () { return that.inertiaFrame(); };
            this.boundSmoothEndFrame = function () { return that.smoothEndFrame(); };
        }

        this.activeDrops = {
            dropzones: [],      // the dropzones that are mentioned below
            elements : [],      // elements of dropzones that accept the target draggable
            rects    : []       // the rects of the elements mentioned above
        };

        // keep track of added pointers
        this.pointers    = [];
        this.pointerIds  = [];
        this.downTargets = [];
        this.downTimes   = [];
        this.holdTimers  = [];

        // Previous native pointer move event coordinates
        this.prevCoords = {
            page     : { x: 0, y: 0 },
            client   : { x: 0, y: 0 },
            timeStamp: 0
        };
        // current native pointer move event coordinates
        this.curCoords = {
            page     : { x: 0, y: 0 },
            client   : { x: 0, y: 0 },
            timeStamp: 0
        };

        // Starting InteractEvent pointer coordinates
        this.startCoords = {
            page     : { x: 0, y: 0 },
            client   : { x: 0, y: 0 },
            timeStamp: 0
        };

        // Change in coordinates and time of the pointer
        this.pointerDelta = {
            page     : { x: 0, y: 0, vx: 0, vy: 0, speed: 0 },
            client   : { x: 0, y: 0, vx: 0, vy: 0, speed: 0 },
            timeStamp: 0
        };

        this.downEvent   = null;    // pointerdown/mousedown/touchstart event
        this.downPointer = {};

        this._eventTarget    = null;
        this._curEventTarget = null;

        this.prevEvent = null;      // previous action event
        this.tapTime   = 0;         // time of the most recent tap event
        this.prevTap   = null;

        this.startOffset    = { left: 0, right: 0, top: 0, bottom: 0 };
        this.restrictOffset = { left: 0, right: 0, top: 0, bottom: 0 };
        this.snapOffsets    = [];

        this.gesture = {
            start: { x: 0, y: 0 },

            startDistance: 0,   // distance between two touches of touchStart
            prevDistance : 0,
            distance     : 0,

            scale: 1,           // gesture.distance / gesture.startDistance

            startAngle: 0,      // angle of line joining two touches
            prevAngle : 0       // angle of the previous gesture event
        };

        this.snapStatus = {
            x       : 0, y       : 0,
            dx      : 0, dy      : 0,
            realX   : 0, realY   : 0,
            snappedX: 0, snappedY: 0,
            targets : [],
            locked  : false,
            changed : false
        };

        this.restrictStatus = {
            dx         : 0, dy         : 0,
            restrictedX: 0, restrictedY: 0,
            snap       : null,
            restricted : false,
            changed    : false
        };

        this.restrictStatus.snap = this.snapStatus;

        this.pointerIsDown   = false;
        this.pointerWasMoved = false;
        this.gesturing       = false;
        this.dragging        = false;
        this.resizing        = false;
        this.resizeAxes      = 'xy';

        this.mouse = false;

        interactions.push(this);
    }

    Interaction.prototype = {
        getPageXY  : function (pointer, xy) { return   getPageXY(pointer, xy, this); },
        getClientXY: function (pointer, xy) { return getClientXY(pointer, xy, this); },
        setEventXY : function (target, ptr) { return  setEventXY(target, ptr, this); },

        pointerOver: function (pointer, event, eventTarget) {
            if (this.prepared.name || !this.mouse) { return; }

            var curMatches = [],
                curMatchElements = [],
                prevTargetElement = this.element;

            this.addPointer(pointer);

            if (this.target
                && (testIgnore(this.target, this.element, eventTarget)
                    || !testAllow(this.target, this.element, eventTarget))) {
                // if the eventTarget should be ignored or shouldn't be allowed
                // clear the previous target
                this.target = null;
                this.element = null;
                this.matches = [];
                this.matchElements = [];
            }

            var elementInteractable = interactables.get(eventTarget),
                elementAction = (elementInteractable
                                 && !testIgnore(elementInteractable, eventTarget, eventTarget)
                                 && testAllow(elementInteractable, eventTarget, eventTarget)
                                 && validateAction(
                                     elementInteractable.getAction(pointer, event, this, eventTarget),
                                     elementInteractable));

            if (elementAction && !withinInteractionLimit(elementInteractable, eventTarget, elementAction)) {
                 elementAction = null;
            }

            function pushCurMatches (interactable, selector) {
                if (interactable
                    && inContext(interactable, eventTarget)
                    && !testIgnore(interactable, eventTarget, eventTarget)
                    && testAllow(interactable, eventTarget, eventTarget)
                    && matchesSelector(eventTarget, selector)) {

                    curMatches.push(interactable);
                    curMatchElements.push(eventTarget);
                }
            }

            if (elementAction) {
                this.target = elementInteractable;
                this.element = eventTarget;
                this.matches = [];
                this.matchElements = [];
            }
            else {
                interactables.forEachSelector(pushCurMatches);

                if (this.validateSelector(pointer, event, curMatches, curMatchElements)) {
                    this.matches = curMatches;
                    this.matchElements = curMatchElements;

                    this.pointerHover(pointer, event, this.matches, this.matchElements);
                    events.add(eventTarget,
                                        PointerEvent? pEventTypes.move : 'mousemove',
                                        listeners.pointerHover);
                }
                else if (this.target) {
                    if (nodeContains(prevTargetElement, eventTarget)) {
                        this.pointerHover(pointer, event, this.matches, this.matchElements);
                        events.add(this.element,
                                            PointerEvent? pEventTypes.move : 'mousemove',
                                            listeners.pointerHover);
                    }
                    else {
                        this.target = null;
                        this.element = null;
                        this.matches = [];
                        this.matchElements = [];
                    }
                }
            }
        },

        // Check what action would be performed on pointerMove target if a mouse
        // button were pressed and change the cursor accordingly
        pointerHover: function (pointer, event, eventTarget, curEventTarget, matches, matchElements) {
            var target = this.target;

            if (!this.prepared.name && this.mouse) {

                var action;

                // update pointer coords for defaultActionChecker to use
                this.setEventXY(this.curCoords, [pointer]);

                if (matches) {
                    action = this.validateSelector(pointer, event, matches, matchElements);
                }
                else if (target) {
                    action = validateAction(target.getAction(this.pointers[0], event, this, this.element), this.target);
                }

                if (target && target.options.styleCursor) {
                    if (action) {
                        target._doc.documentElement.style.cursor = getActionCursor(action);
                    }
                    else {
                        target._doc.documentElement.style.cursor = '';
                    }
                }
            }
            else if (this.prepared.name) {
                this.checkAndPreventDefault(event, target, this.element);
            }
        },

        pointerOut: function (pointer, event, eventTarget) {
            if (this.prepared.name) { return; }

            // Remove temporary event listeners for selector Interactables
            if (!interactables.get(eventTarget)) {
                events.remove(eventTarget,
                                       PointerEvent? pEventTypes.move : 'mousemove',
                                       listeners.pointerHover);
            }

            if (this.target && this.target.options.styleCursor && !this.interacting()) {
                this.target._doc.documentElement.style.cursor = '';
            }
        },

        selectorDown: function (pointer, event, eventTarget, curEventTarget) {
            var that = this,
                // copy event to be used in timeout for IE8
                eventCopy = events.useAttachEvent? extend({}, event) : event,
                element = eventTarget,
                pointerIndex = this.addPointer(pointer),
                action;

            this.holdTimers[pointerIndex] = setTimeout(function () {
                that.pointerHold(events.useAttachEvent? eventCopy : pointer, eventCopy, eventTarget, curEventTarget);
            }, defaultOptions._holdDuration);

            this.pointerIsDown = true;

            // Check if the down event hits the current inertia target
            if (this.inertiaStatus.active && this.target.selector) {
                // climb up the DOM tree from the event target
                while (isElement(element)) {

                    // if this element is the current inertia target element
                    if (element === this.element
                        // and the prospective action is the same as the ongoing one
                        && validateAction(this.target.getAction(pointer, event, this, this.element), this.target).name === this.prepared.name) {

                        // stop inertia so that the next move will be a normal one
                        cancelFrame(this.inertiaStatus.i);
                        this.inertiaStatus.active = false;

                        this.collectEventTargets(pointer, event, eventTarget, 'down');
                        return;
                    }
                    element = parentElement(element);
                }
            }

            // do nothing if interacting
            if (this.interacting()) {
                this.collectEventTargets(pointer, event, eventTarget, 'down');
                return;
            }

            function pushMatches (interactable, selector, context) {
                var elements = ie8MatchesSelector
                    ? context.querySelectorAll(selector)
                    : undefined;

                if (inContext(interactable, element)
                    && !testIgnore(interactable, element, eventTarget)
                    && testAllow(interactable, element, eventTarget)
                    && matchesSelector(element, selector, elements)) {

                    that.matches.push(interactable);
                    that.matchElements.push(element);
                }
            }

            // update pointer coords for defaultActionChecker to use
            this.setEventXY(this.curCoords, [pointer]);
            this.downEvent = event;

            while (isElement(element) && !action) {
                this.matches = [];
                this.matchElements = [];

                interactables.forEachSelector(pushMatches);

                action = this.validateSelector(pointer, event, this.matches, this.matchElements);
                element = parentElement(element);
            }

            if (action) {
                this.prepared.name  = action.name;
                this.prepared.axis  = action.axis;
                this.prepared.edges = action.edges;

                this.collectEventTargets(pointer, event, eventTarget, 'down');

                return this.pointerDown(pointer, event, eventTarget, curEventTarget, action);
            }
            else {
                // do these now since pointerDown isn't being called from here
                this.downTimes[pointerIndex] = new Date().getTime();
                this.downTargets[pointerIndex] = eventTarget;
                pointerExtend(this.downPointer, pointer);

                copyCoords(this.prevCoords, this.curCoords);
                this.pointerWasMoved = false;
            }

            this.collectEventTargets(pointer, event, eventTarget, 'down');
        },

        // Determine action to be performed on next pointerMove and add appropriate
        // style and event Listeners
        pointerDown: function (pointer, event, eventTarget, curEventTarget, forceAction) {
            if (!forceAction && !this.inertiaStatus.active && this.pointerWasMoved && this.prepared.name) {
                this.checkAndPreventDefault(event, this.target, this.element);

                return;
            }

            this.pointerIsDown = true;
            this.downEvent = event;

            var pointerIndex = this.addPointer(pointer),
                action;

            // If it is the second touch of a multi-touch gesture, keep the
            // target the same and get a new action if a target was set by the
            // first touch
            if (this.pointerIds.length > 1 && this.target._element === this.element) {
                var newAction = validateAction(forceAction || this.target.getAction(pointer, event, this, this.element), this.target);

                if (withinInteractionLimit(this.target, this.element, newAction)) {
                    action = newAction;
                }

                this.prepared.name = null;
            }
            // Otherwise, set the target if there is no action prepared
            else if (!this.prepared.name) {
                var interactable = interactables.get(curEventTarget);

                if (interactable
                    && !testIgnore(interactable, curEventTarget, eventTarget)
                    && testAllow(interactable, curEventTarget, eventTarget)
                    && (action = validateAction(forceAction || interactable.getAction(pointer, event, this, curEventTarget), interactable, eventTarget))
                    && withinInteractionLimit(interactable, curEventTarget, action)) {
                    this.target = interactable;
                    this.element = curEventTarget;
                }
            }

            var target = this.target,
                options = target && target.options;

            if (target && (forceAction || !this.prepared.name)) {
                action = action || validateAction(forceAction || target.getAction(pointer, event, this, curEventTarget), target, this.element);

                this.setEventXY(this.startCoords, this.pointers);

                if (!action) { return; }

                if (options.styleCursor) {
                    target._doc.documentElement.style.cursor = getActionCursor(action);
                }

                this.resizeAxes = action.name === 'resize'? action.axis : null;

                if (action === 'gesture' && this.pointerIds.length < 2) {
                    action = null;
                }

                this.prepared.name  = action.name;
                this.prepared.axis  = action.axis;
                this.prepared.edges = action.edges;

                this.snapStatus.snappedX = this.snapStatus.snappedY =
                    this.restrictStatus.restrictedX = this.restrictStatus.restrictedY = NaN;

                this.downTimes[pointerIndex] = new Date().getTime();
                this.downTargets[pointerIndex] = eventTarget;
                pointerExtend(this.downPointer, pointer);

                copyCoords(this.prevCoords, this.startCoords);
                this.pointerWasMoved = false;

                this.checkAndPreventDefault(event, target, this.element);
            }
            // if inertia is active try to resume action
            else if (this.inertiaStatus.active
                && curEventTarget === this.element
                && validateAction(target.getAction(pointer, event, this, this.element), target).name === this.prepared.name) {

                cancelFrame(this.inertiaStatus.i);
                this.inertiaStatus.active = false;

                this.checkAndPreventDefault(event, target, this.element);
            }
        },

        setModifications: function (coords, preEnd) {
            var target         = this.target,
                shouldMove     = true,
                shouldSnap     = checkSnap(target, this.prepared.name)     && (!target.options[this.prepared.name].snap.endOnly     || preEnd),
                shouldRestrict = checkRestrict(target, this.prepared.name) && (!target.options[this.prepared.name].restrict.endOnly || preEnd);

            if (shouldSnap    ) { this.setSnapping   (coords); } else { this.snapStatus    .locked     = false; }
            if (shouldRestrict) { this.setRestriction(coords); } else { this.restrictStatus.restricted = false; }

            if (shouldSnap && this.snapStatus.locked && !this.snapStatus.changed) {
                shouldMove = shouldRestrict && this.restrictStatus.restricted && this.restrictStatus.changed;
            }
            else if (shouldRestrict && this.restrictStatus.restricted && !this.restrictStatus.changed) {
                shouldMove = false;
            }

            return shouldMove;
        },

        setStartOffsets: function (action, interactable, element) {
            var rect = interactable.getRect(element),
                origin = getOriginXY(interactable, element),
                snap = interactable.options[this.prepared.name].snap,
                restrict = interactable.options[this.prepared.name].restrict,
                width, height;

            if (rect) {
                this.startOffset.left = this.startCoords.page.x - rect.left;
                this.startOffset.top  = this.startCoords.page.y - rect.top;

                this.startOffset.right  = rect.right  - this.startCoords.page.x;
                this.startOffset.bottom = rect.bottom - this.startCoords.page.y;

                if ('width' in rect) { width = rect.width; }
                else { width = rect.right - rect.left; }
                if ('height' in rect) { height = rect.height; }
                else { height = rect.bottom - rect.top; }
            }
            else {
                this.startOffset.left = this.startOffset.top = this.startOffset.right = this.startOffset.bottom = 0;
            }

            this.snapOffsets.splice(0);

            var snapOffset = snap && snap.offset === 'startCoords'
                                ? {
                                    x: this.startCoords.page.x - origin.x,
                                    y: this.startCoords.page.y - origin.y
                                }
                                : snap && snap.offset || { x: 0, y: 0 };

            if (rect && snap && snap.relativePoints && snap.relativePoints.length) {
                for (var i = 0; i < snap.relativePoints.length; i++) {
                    this.snapOffsets.push({
                        x: this.startOffset.left - (width  * snap.relativePoints[i].x) + snapOffset.x,
                        y: this.startOffset.top  - (height * snap.relativePoints[i].y) + snapOffset.y
                    });
                }
            }
            else {
                this.snapOffsets.push(snapOffset);
            }

            if (rect && restrict.elementRect) {
                this.restrictOffset.left = this.startOffset.left - (width  * restrict.elementRect.left);
                this.restrictOffset.top  = this.startOffset.top  - (height * restrict.elementRect.top);

                this.restrictOffset.right  = this.startOffset.right  - (width  * (1 - restrict.elementRect.right));
                this.restrictOffset.bottom = this.startOffset.bottom - (height * (1 - restrict.elementRect.bottom));
            }
            else {
                this.restrictOffset.left = this.restrictOffset.top = this.restrictOffset.right = this.restrictOffset.bottom = 0;
            }
        },

        /*\
         * Interaction.start
         [ method ]
         *
         * Start an action with the given Interactable and Element as tartgets. The
         * action must be enabled for the target Interactable and an appropriate number
         * of pointers must be held down – 1 for drag/resize, 2 for gesture.
         *
         * Use it with `interactable.<action>able({ manualStart: false })` to always
         * [start actions manually](https://github.com/taye/interact.js/issues/114)
         *
         - action       (object)  The action to be performed - drag, resize, etc.
         - interactable (Interactable) The Interactable to target
         - element      (Element) The DOM Element to target
         = (object) interact
         **
         | interact(target)
         |   .draggable({
         |     // disable the default drag start by down->move
         |     manualStart: true
         |   })
         |   // start dragging after the user holds the pointer down
         |   .on('hold', function (event) {
         |     var interaction = event.interaction;
         |
         |     if (!interaction.interacting()) {
         |       interaction.start({ name: 'drag' },
         |                         event.interactable,
         |                         event.currentTarget);
         |     }
         | });
        \*/
        start: function (action, interactable, element) {
            if (this.interacting()
                || !this.pointerIsDown
                || this.pointerIds.length < (action.name === 'gesture'? 2 : 1)) {
                return;
            }

            // if this interaction had been removed after stopping
            // add it back
            if (indexOf(interactions, this) === -1) {
                interactions.push(this);
            }

            // set the startCoords if there was no prepared action
            if (!this.prepared.name) {
                this.setEventXY(this.startCoords);
            }

            this.prepared.name  = action.name;
            this.prepared.axis  = action.axis;
            this.prepared.edges = action.edges;
            this.target         = interactable;
            this.element        = element;

            this.setStartOffsets(action.name, interactable, element);
            this.setModifications(this.startCoords.page);

            this.prevEvent = this[this.prepared.name + 'Start'](this.downEvent);
        },

        pointerMove: function (pointer, event, eventTarget, curEventTarget, preEnd) {
            if (this.inertiaStatus.active) {
                var pageUp   = this.inertiaStatus.upCoords.page;
                var clientUp = this.inertiaStatus.upCoords.client;

                var inertiaPosition = {
                    pageX  : pageUp.x   + this.inertiaStatus.sx,
                    pageY  : pageUp.y   + this.inertiaStatus.sy,
                    clientX: clientUp.x + this.inertiaStatus.sx,
                    clientY: clientUp.y + this.inertiaStatus.sy
                };

                this.setEventXY(this.curCoords, [inertiaPosition]);
            }
            else {
                this.recordPointer(pointer);
                this.setEventXY(this.curCoords, this.pointers);
            }

            var duplicateMove = (this.curCoords.page.x === this.prevCoords.page.x
                                 && this.curCoords.page.y === this.prevCoords.page.y
                                 && this.curCoords.client.x === this.prevCoords.client.x
                                 && this.curCoords.client.y === this.prevCoords.client.y);

            var dx, dy,
                pointerIndex = this.mouse? 0 : indexOf(this.pointerIds, getPointerId(pointer));

            // register movement greater than pointerMoveTolerance
            if (this.pointerIsDown && !this.pointerWasMoved) {
                dx = this.curCoords.client.x - this.startCoords.client.x;
                dy = this.curCoords.client.y - this.startCoords.client.y;

                this.pointerWasMoved = hypot(dx, dy) > pointerMoveTolerance;
            }

            if (!duplicateMove && (!this.pointerIsDown || this.pointerWasMoved)) {
                if (this.pointerIsDown) {
                    clearTimeout(this.holdTimers[pointerIndex]);
                }

                this.collectEventTargets(pointer, event, eventTarget, 'move');
            }

            if (!this.pointerIsDown) { return; }

            if (duplicateMove && this.pointerWasMoved && !preEnd) {
                this.checkAndPreventDefault(event, this.target, this.element);
                return;
            }

            // set pointer coordinate, time changes and speeds
            setEventDeltas(this.pointerDelta, this.prevCoords, this.curCoords);

            if (!this.prepared.name) { return; }

            if (this.pointerWasMoved
                // ignore movement while inertia is active
                && (!this.inertiaStatus.active || (pointer instanceof InteractEvent && /inertiastart/.test(pointer.type)))) {

                // if just starting an action, calculate the pointer speed now
                if (!this.interacting()) {
                    setEventDeltas(this.pointerDelta, this.prevCoords, this.curCoords);

                    // check if a drag is in the correct axis
                    if (this.prepared.name === 'drag') {
                        var absX = Math.abs(dx),
                            absY = Math.abs(dy),
                            targetAxis = this.target.options.drag.axis,
                            axis = (absX > absY ? 'x' : absX < absY ? 'y' : 'xy');

                        // if the movement isn't in the axis of the interactable
                        if (axis !== 'xy' && targetAxis !== 'xy' && targetAxis !== axis) {
                            // cancel the prepared action
                            this.prepared.name = null;

                            // then try to get a drag from another ineractable

                            var element = eventTarget;

                            // check element interactables
                            while (isElement(element)) {
                                var elementInteractable = interactables.get(element);

                                if (elementInteractable
                                    && elementInteractable !== this.target
                                    && !elementInteractable.options.drag.manualStart
                                    && elementInteractable.getAction(this.downPointer, this.downEvent, this, element).name === 'drag'
                                    && checkAxis(axis, elementInteractable)) {

                                    this.prepared.name = 'drag';
                                    this.target = elementInteractable;
                                    this.element = element;
                                    break;
                                }

                                element = parentElement(element);
                            }

                            // if there's no drag from element interactables,
                            // check the selector interactables
                            if (!this.prepared.name) {
                                var thisInteraction = this;

                                var getDraggable = function (interactable, selector, context) {
                                    var elements = ie8MatchesSelector
                                        ? context.querySelectorAll(selector)
                                        : undefined;

                                    if (interactable === thisInteraction.target) { return; }

                                    if (inContext(interactable, eventTarget)
                                        && !interactable.options.drag.manualStart
                                        && !testIgnore(interactable, element, eventTarget)
                                        && testAllow(interactable, element, eventTarget)
                                        && matchesSelector(element, selector, elements)
                                        && interactable.getAction(thisInteraction.downPointer, thisInteraction.downEvent, thisInteraction, element).name === 'drag'
                                        && checkAxis(axis, interactable)
                                        && withinInteractionLimit(interactable, element, 'drag')) {

                                        return interactable;
                                    }
                                };

                                element = eventTarget;

                                while (isElement(element)) {
                                    var selectorInteractable = interactables.forEachSelector(getDraggable);

                                    if (selectorInteractable) {
                                        this.prepared.name = 'drag';
                                        this.target = selectorInteractable;
                                        this.element = element;
                                        break;
                                    }

                                    element = parentElement(element);
                                }
                            }
                        }
                    }
                }

                var starting = !!this.prepared.name && !this.interacting();

                if (starting
                    && (this.target.options[this.prepared.name].manualStart
                        || !withinInteractionLimit(this.target, this.element, this.prepared))) {
                    this.stop(event);
                    return;
                }

                if (this.prepared.name && this.target) {
                    if (starting) {
                        this.start(this.prepared, this.target, this.element);
                    }

                    var shouldMove = this.setModifications(this.curCoords.page, preEnd);

                    // move if snapping or restriction doesn't prevent it
                    if (shouldMove || starting) {
                        this.prevEvent = this[this.prepared.name + 'Move'](event);
                    }

                    this.checkAndPreventDefault(event, this.target, this.element);
                }
            }

            copyCoords(this.prevCoords, this.curCoords);

            if (this.dragging || this.resizing) {
                this.autoScrollMove(pointer);
            }
        },

        dragStart: function (event) {
            var dragEvent = new InteractEvent(this, event, 'drag', 'start', this.element);

            this.dragging = true;
            this.target.fire(dragEvent);

            // reset active dropzones
            this.activeDrops.dropzones = [];
            this.activeDrops.elements  = [];
            this.activeDrops.rects     = [];

            if (!this.dynamicDrop) {
                this.setActiveDrops(this.element);
            }

            var dropEvents = this.getDropEvents(event, dragEvent);

            if (dropEvents.activate) {
                this.fireActiveDrops(dropEvents.activate);
            }

            return dragEvent;
        },

        dragMove: function (event) {
            var target = this.target,
                dragEvent  = new InteractEvent(this, event, 'drag', 'move', this.element),
                draggableElement = this.element,
                drop = this.getDrop(dragEvent, event, draggableElement);

            this.dropTarget = drop.dropzone;
            this.dropElement = drop.element;

            var dropEvents = this.getDropEvents(event, dragEvent);

            target.fire(dragEvent);

            if (dropEvents.leave) { this.prevDropTarget.fire(dropEvents.leave); }
            if (dropEvents.enter) {     this.dropTarget.fire(dropEvents.enter); }
            if (dropEvents.move ) {     this.dropTarget.fire(dropEvents.move ); }

            this.prevDropTarget  = this.dropTarget;
            this.prevDropElement = this.dropElement;

            return dragEvent;
        },

        resizeStart: function (event) {
            var resizeEvent = new InteractEvent(this, event, 'resize', 'start', this.element);

            if (this.prepared.edges) {
                var startRect = this.target.getRect(this.element);

                /*
                 * When using the `resizable.square` or `resizable.preserveAspectRatio` options, resizing from one edge
                 * will affect another. E.g. with `resizable.square`, resizing to make the right edge larger will make
                 * the bottom edge larger by the same amount. We call these 'linked' edges. Any linked edges will depend
                 * on the active edges and the edge being interacted with.
                 */
                if (this.target.options.resize.square || this.target.options.resize.preserveAspectRatio) {
                    var linkedEdges = extend({}, this.prepared.edges);

                    linkedEdges.top    = linkedEdges.top    || (linkedEdges.left   && !linkedEdges.bottom);
                    linkedEdges.left   = linkedEdges.left   || (linkedEdges.top    && !linkedEdges.right );
                    linkedEdges.bottom = linkedEdges.bottom || (linkedEdges.right  && !linkedEdges.top   );
                    linkedEdges.right  = linkedEdges.right  || (linkedEdges.bottom && !linkedEdges.left  );

                    this.prepared._linkedEdges = linkedEdges;
                }
                else {
                    this.prepared._linkedEdges = null;
                }

                // if using `resizable.preserveAspectRatio` option, record aspect ratio at the start of the resize
                if (this.target.options.resize.preserveAspectRatio) {
                    this.resizeStartAspectRatio = startRect.width / startRect.height;
                }

                this.resizeRects = {
                    start     : startRect,
                    current   : extend({}, startRect),
                    restricted: extend({}, startRect),
                    previous  : extend({}, startRect),
                    delta     : {
                        left: 0, right : 0, width : 0,
                        top : 0, bottom: 0, height: 0
                    }
                };

                resizeEvent.rect = this.resizeRects.restricted;
                resizeEvent.deltaRect = this.resizeRects.delta;
            }

            this.target.fire(resizeEvent);

            this.resizing = true;

            return resizeEvent;
        },

        resizeMove: function (event) {
            var resizeEvent = new InteractEvent(this, event, 'resize', 'move', this.element);

            var edges = this.prepared.edges,
                invert = this.target.options.resize.invert,
                invertible = invert === 'reposition' || invert === 'negate';

            if (edges) {
                var dx = resizeEvent.dx,
                    dy = resizeEvent.dy,

                    start      = this.resizeRects.start,
                    current    = this.resizeRects.current,
                    restricted = this.resizeRects.restricted,
                    delta      = this.resizeRects.delta,
                    previous   = extend(this.resizeRects.previous, restricted),

                    originalEdges = edges;

                // `resize.preserveAspectRatio` takes precedence over `resize.square`
                if (this.target.options.resize.preserveAspectRatio) {
                    var resizeStartAspectRatio = this.resizeStartAspectRatio;

                    edges = this.prepared._linkedEdges;

                    if ((originalEdges.left && originalEdges.bottom)
                        || (originalEdges.right && originalEdges.top)) {
                        dy = -dx / resizeStartAspectRatio;
                    }
                    else if (originalEdges.left || originalEdges.right) { dy = dx / resizeStartAspectRatio; }
                    else if (originalEdges.top || originalEdges.bottom) { dx = dy * resizeStartAspectRatio; }
                }
                else if (this.target.options.resize.square) {
                    edges = this.prepared._linkedEdges;

                    if ((originalEdges.left && originalEdges.bottom)
                        || (originalEdges.right && originalEdges.top)) {
                        dy = -dx;
                    }
                    else if (originalEdges.left || originalEdges.right) { dy = dx; }
                    else if (originalEdges.top || originalEdges.bottom) { dx = dy; }
                }

                // update the 'current' rect without modifications
                if (edges.top   ) { current.top    += dy; }
                if (edges.bottom) { current.bottom += dy; }
                if (edges.left  ) { current.left   += dx; }
                if (edges.right ) { current.right  += dx; }

                if (invertible) {
                    // if invertible, copy the current rect
                    extend(restricted, current);

                    if (invert === 'reposition') {
                        // swap edge values if necessary to keep width/height positive
                        var swap;

                        if (restricted.top > restricted.bottom) {
                            swap = restricted.top;

                            restricted.top = restricted.bottom;
                            restricted.bottom = swap;
                        }
                        if (restricted.left > restricted.right) {
                            swap = restricted.left;

                            restricted.left = restricted.right;
                            restricted.right = swap;
                        }
                    }
                }
                else {
                    // if not invertible, restrict to minimum of 0x0 rect
                    restricted.top    = Math.min(current.top, start.bottom);
                    restricted.bottom = Math.max(current.bottom, start.top);
                    restricted.left   = Math.min(current.left, start.right);
                    restricted.right  = Math.max(current.right, start.left);
                }

                restricted.width  = restricted.right  - restricted.left;
                restricted.height = restricted.bottom - restricted.top ;

                for (var edge in restricted) {
                    delta[edge] = restricted[edge] - previous[edge];
                }

                resizeEvent.edges = this.prepared.edges;
                resizeEvent.rect = restricted;
                resizeEvent.deltaRect = delta;
            }

            this.target.fire(resizeEvent);

            return resizeEvent;
        },

        gestureStart: function (event) {
            var gestureEvent = new InteractEvent(this, event, 'gesture', 'start', this.element);

            gestureEvent.ds = 0;

            this.gesture.startDistance = this.gesture.prevDistance = gestureEvent.distance;
            this.gesture.startAngle = this.gesture.prevAngle = gestureEvent.angle;
            this.gesture.scale = 1;

            this.gesturing = true;

            this.target.fire(gestureEvent);

            return gestureEvent;
        },

        gestureMove: function (event) {
            if (!this.pointerIds.length) {
                return this.prevEvent;
            }

            var gestureEvent;

            gestureEvent = new InteractEvent(this, event, 'gesture', 'move', this.element);
            gestureEvent.ds = gestureEvent.scale - this.gesture.scale;

            this.target.fire(gestureEvent);

            this.gesture.prevAngle = gestureEvent.angle;
            this.gesture.prevDistance = gestureEvent.distance;

            if (gestureEvent.scale !== Infinity &&
                gestureEvent.scale !== null &&
                gestureEvent.scale !== undefined  &&
                !isNaN(gestureEvent.scale)) {

                this.gesture.scale = gestureEvent.scale;
            }

            return gestureEvent;
        },

        pointerHold: function (pointer, event, eventTarget) {
            this.collectEventTargets(pointer, event, eventTarget, 'hold');
        },

        pointerUp: function (pointer, event, eventTarget, curEventTarget) {
            var pointerIndex = this.mouse? 0 : indexOf(this.pointerIds, getPointerId(pointer));

            clearTimeout(this.holdTimers[pointerIndex]);

            this.collectEventTargets(pointer, event, eventTarget, 'up' );
            this.collectEventTargets(pointer, event, eventTarget, 'tap');

            this.pointerEnd(pointer, event, eventTarget, curEventTarget);

            this.removePointer(pointer);
        },

        pointerCancel: function (pointer, event, eventTarget, curEventTarget) {
            var pointerIndex = this.mouse? 0 : indexOf(this.pointerIds, getPointerId(pointer));

            clearTimeout(this.holdTimers[pointerIndex]);

            this.collectEventTargets(pointer, event, eventTarget, 'cancel');
            this.pointerEnd(pointer, event, eventTarget, curEventTarget);

            this.removePointer(pointer);
        },

        // http://www.quirksmode.org/dom/events/click.html
        // >Events leading to dblclick
        //
        // IE8 doesn't fire down event before dblclick.
        // This workaround tries to fire a tap and doubletap after dblclick
        ie8Dblclick: function (pointer, event, eventTarget) {
            if (this.prevTap
                && event.clientX === this.prevTap.clientX
                && event.clientY === this.prevTap.clientY
                && eventTarget   === this.prevTap.target) {

                this.downTargets[0] = eventTarget;
                this.downTimes[0] = new Date().getTime();
                this.collectEventTargets(pointer, event, eventTarget, 'tap');
            }
        },

        // End interact move events and stop auto-scroll unless inertia is enabled
        pointerEnd: function (pointer, event, eventTarget, curEventTarget) {
            var endEvent,
                target = this.target,
                options = target && target.options,
                inertiaOptions = options && this.prepared.name && options[this.prepared.name].inertia,
                inertiaStatus = this.inertiaStatus;

            if (this.interacting()) {

                if (inertiaStatus.active && !inertiaStatus.ending) { return; }

                var pointerSpeed,
                    now = new Date().getTime(),
                    inertiaPossible = false,
                    inertia = false,
                    smoothEnd = false,
                    endSnap = checkSnap(target, this.prepared.name) && options[this.prepared.name].snap.endOnly,
                    endRestrict = checkRestrict(target, this.prepared.name) && options[this.prepared.name].restrict.endOnly,
                    dx = 0,
                    dy = 0,
                    startEvent;

                if (this.dragging) {
                    if      (options.drag.axis === 'x' ) { pointerSpeed = Math.abs(this.pointerDelta.client.vx); }
                    else if (options.drag.axis === 'y' ) { pointerSpeed = Math.abs(this.pointerDelta.client.vy); }
                    else   /*options.drag.axis === 'xy'*/{ pointerSpeed = this.pointerDelta.client.speed; }
                }
                else {
                    pointerSpeed = this.pointerDelta.client.speed;
                }

                // check if inertia should be started
                inertiaPossible = (inertiaOptions && inertiaOptions.enabled
                                   && this.prepared.name !== 'gesture'
                                   && event !== inertiaStatus.startEvent);

                inertia = (inertiaPossible
                           && (now - this.curCoords.timeStamp) < 50
                           && pointerSpeed > inertiaOptions.minSpeed
                           && pointerSpeed > inertiaOptions.endSpeed);

                if (inertiaPossible && !inertia && (endSnap || endRestrict)) {

                    var snapRestrict = {};

                    snapRestrict.snap = snapRestrict.restrict = snapRestrict;

                    if (endSnap) {
                        this.setSnapping(this.curCoords.page, snapRestrict);
                        if (snapRestrict.locked) {
                            dx += snapRestrict.dx;
                            dy += snapRestrict.dy;
                        }
                    }

                    if (endRestrict) {
                        this.setRestriction(this.curCoords.page, snapRestrict);
                        if (snapRestrict.restricted) {
                            dx += snapRestrict.dx;
                            dy += snapRestrict.dy;
                        }
                    }

                    if (dx || dy) {
                        smoothEnd = true;
                    }
                }

                if (inertia || smoothEnd) {
                    copyCoords(inertiaStatus.upCoords, this.curCoords);

                    this.pointers[0] = inertiaStatus.startEvent = startEvent =
                        new InteractEvent(this, event, this.prepared.name, 'inertiastart', this.element);

                    inertiaStatus.t0 = now;

                    target.fire(inertiaStatus.startEvent);

                    if (inertia) {
                        inertiaStatus.vx0 = this.pointerDelta.client.vx;
                        inertiaStatus.vy0 = this.pointerDelta.client.vy;
                        inertiaStatus.v0 = pointerSpeed;

                        this.calcInertia(inertiaStatus);

                        var page = extend({}, this.curCoords.page),
                            origin = getOriginXY(target, this.element),
                            statusObject;

                        page.x = page.x + inertiaStatus.xe - origin.x;
                        page.y = page.y + inertiaStatus.ye - origin.y;

                        statusObject = {
                            useStatusXY: true,
                            x: page.x,
                            y: page.y,
                            dx: 0,
                            dy: 0,
                            snap: null
                        };

                        statusObject.snap = statusObject;

                        dx = dy = 0;

                        if (endSnap) {
                            var snap = this.setSnapping(this.curCoords.page, statusObject);

                            if (snap.locked) {
                                dx += snap.dx;
                                dy += snap.dy;
                            }
                        }

                        if (endRestrict) {
                            var restrict = this.setRestriction(this.curCoords.page, statusObject);

                            if (restrict.restricted) {
                                dx += restrict.dx;
                                dy += restrict.dy;
                            }
                        }

                        inertiaStatus.modifiedXe += dx;
                        inertiaStatus.modifiedYe += dy;

                        inertiaStatus.i = reqFrame(this.boundInertiaFrame);
                    }
                    else {
                        inertiaStatus.smoothEnd = true;
                        inertiaStatus.xe = dx;
                        inertiaStatus.ye = dy;

                        inertiaStatus.sx = inertiaStatus.sy = 0;

                        inertiaStatus.i = reqFrame(this.boundSmoothEndFrame);
                    }

                    inertiaStatus.active = true;
                    return;
                }

                if (endSnap || endRestrict) {
                    // fire a move event at the snapped coordinates
                    this.pointerMove(pointer, event, eventTarget, curEventTarget, true);
                }
            }

            if (this.dragging) {
                endEvent = new InteractEvent(this, event, 'drag', 'end', this.element);

                var draggableElement = this.element,
                    drop = this.getDrop(endEvent, event, draggableElement);

                this.dropTarget = drop.dropzone;
                this.dropElement = drop.element;

                var dropEvents = this.getDropEvents(event, endEvent);

                if (dropEvents.leave) { this.prevDropTarget.fire(dropEvents.leave); }
                if (dropEvents.enter) {     this.dropTarget.fire(dropEvents.enter); }
                if (dropEvents.drop ) {     this.dropTarget.fire(dropEvents.drop ); }
                if (dropEvents.deactivate) {
                    this.fireActiveDrops(dropEvents.deactivate);
                }

                target.fire(endEvent);
            }
            else if (this.resizing) {
                endEvent = new InteractEvent(this, event, 'resize', 'end', this.element);
                target.fire(endEvent);
            }
            else if (this.gesturing) {
                endEvent = new InteractEvent(this, event, 'gesture', 'end', this.element);
                target.fire(endEvent);
            }

            this.stop(event);
        },

        collectDrops: function (element) {
            var drops = [],
                elements = [],
                i;

            element = element || this.element;

            // collect all dropzones and their elements which qualify for a drop
            for (i = 0; i < interactables.length; i++) {
                if (!interactables[i].options.drop.enabled) { continue; }

                var current = interactables[i],
                    accept = current.options.drop.accept;

                // test the draggable element against the dropzone's accept setting
                if ((isElement(accept) && accept !== element)
                    || (isString(accept)
                        && !matchesSelector(element, accept))) {

                    continue;
                }

                // query for new elements if necessary
                var dropElements = current.selector? current._context.querySelectorAll(current.selector) : [current._element];

                for (var j = 0, len = dropElements.length; j < len; j++) {
                    var currentElement = dropElements[j];

                    if (currentElement === element) {
                        continue;
                    }

                    drops.push(current);
                    elements.push(currentElement);
                }
            }

            return {
                dropzones: drops,
                elements: elements
            };
        },

        fireActiveDrops: function (event) {
            var i,
                current,
                currentElement,
                prevElement;

            // loop through all active dropzones and trigger event
            for (i = 0; i < this.activeDrops.dropzones.length; i++) {
                current = this.activeDrops.dropzones[i];
                currentElement = this.activeDrops.elements [i];

                // prevent trigger of duplicate events on same element
                if (currentElement !== prevElement) {
                    // set current element as event target
                    event.target = currentElement;
                    current.fire(event);
                }
                prevElement = currentElement;
            }
        },

        // Collect a new set of possible drops and save them in activeDrops.
        // setActiveDrops should always be called when a drag has just started or a
        // drag event happens while dynamicDrop is true
        setActiveDrops: function (dragElement) {
            // get dropzones and their elements that could receive the draggable
            var possibleDrops = this.collectDrops(dragElement, true);

            this.activeDrops.dropzones = possibleDrops.dropzones;
            this.activeDrops.elements  = possibleDrops.elements;
            this.activeDrops.rects     = [];

            for (var i = 0; i < this.activeDrops.dropzones.length; i++) {
                this.activeDrops.rects[i] = this.activeDrops.dropzones[i].getRect(this.activeDrops.elements[i]);
            }
        },

        getDrop: function (dragEvent, event, dragElement) {
            var validDrops = [];

            if (dynamicDrop) {
                this.setActiveDrops(dragElement);
            }

            // collect all dropzones and their elements which qualify for a drop
            for (var j = 0; j < this.activeDrops.dropzones.length; j++) {
                var current        = this.activeDrops.dropzones[j],
                    currentElement = this.activeDrops.elements [j],
                    rect           = this.activeDrops.rects    [j];

                validDrops.push(current.dropCheck(dragEvent, event, this.target, dragElement, currentElement, rect)
                                ? currentElement
                                : null);
            }

            // get the most appropriate dropzone based on DOM depth and order
            var dropIndex = indexOfDeepestElement(validDrops),
                dropzone  = this.activeDrops.dropzones[dropIndex] || null,
                element   = this.activeDrops.elements [dropIndex] || null;

            return {
                dropzone: dropzone,
                element: element
            };
        },

        getDropEvents: function (pointerEvent, dragEvent) {
            var dropEvents = {
                enter     : null,
                leave     : null,
                activate  : null,
                deactivate: null,
                move      : null,
                drop      : null
            };

            if (this.dropElement !== this.prevDropElement) {
                // if there was a prevDropTarget, create a dragleave event
                if (this.prevDropTarget) {
                    dropEvents.leave = {
                        target       : this.prevDropElement,
                        dropzone     : this.prevDropTarget,
                        relatedTarget: dragEvent.target,
                        draggable    : dragEvent.interactable,
                        dragEvent    : dragEvent,
                        interaction  : this,
                        timeStamp    : dragEvent.timeStamp,
                        type         : 'dragleave'
                    };

                    dragEvent.dragLeave = this.prevDropElement;
                    dragEvent.prevDropzone = this.prevDropTarget;
                }
                // if the dropTarget is not null, create a dragenter event
                if (this.dropTarget) {
                    dropEvents.enter = {
                        target       : this.dropElement,
                        dropzone     : this.dropTarget,
                        relatedTarget: dragEvent.target,
                        draggable    : dragEvent.interactable,
                        dragEvent    : dragEvent,
                        interaction  : this,
                        timeStamp    : dragEvent.timeStamp,
                        type         : 'dragenter'
                    };

                    dragEvent.dragEnter = this.dropElement;
                    dragEvent.dropzone = this.dropTarget;
                }
            }

            if (dragEvent.type === 'dragend' && this.dropTarget) {
                dropEvents.drop = {
                    target       : this.dropElement,
                    dropzone     : this.dropTarget,
                    relatedTarget: dragEvent.target,
                    draggable    : dragEvent.interactable,
                    dragEvent    : dragEvent,
                    interaction  : this,
                    timeStamp    : dragEvent.timeStamp,
                    type         : 'drop'
                };

                dragEvent.dropzone = this.dropTarget;
            }
            if (dragEvent.type === 'dragstart') {
                dropEvents.activate = {
                    target       : null,
                    dropzone     : null,
                    relatedTarget: dragEvent.target,
                    draggable    : dragEvent.interactable,
                    dragEvent    : dragEvent,
                    interaction  : this,
                    timeStamp    : dragEvent.timeStamp,
                    type         : 'dropactivate'
                };
            }
            if (dragEvent.type === 'dragend') {
                dropEvents.deactivate = {
                    target       : null,
                    dropzone     : null,
                    relatedTarget: dragEvent.target,
                    draggable    : dragEvent.interactable,
                    dragEvent    : dragEvent,
                    interaction  : this,
                    timeStamp    : dragEvent.timeStamp,
                    type         : 'dropdeactivate'
                };
            }
            if (dragEvent.type === 'dragmove' && this.dropTarget) {
                dropEvents.move = {
                    target       : this.dropElement,
                    dropzone     : this.dropTarget,
                    relatedTarget: dragEvent.target,
                    draggable    : dragEvent.interactable,
                    dragEvent    : dragEvent,
                    interaction  : this,
                    dragmove     : dragEvent,
                    timeStamp    : dragEvent.timeStamp,
                    type         : 'dropmove'
                };
                dragEvent.dropzone = this.dropTarget;
            }

            return dropEvents;
        },

        currentAction: function () {
            return (this.dragging && 'drag') || (this.resizing && 'resize') || (this.gesturing && 'gesture') || null;
        },

        interacting: function () {
            return this.dragging || this.resizing || this.gesturing;
        },

        clearTargets: function () {
            this.target = this.element = null;

            this.dropTarget = this.dropElement = this.prevDropTarget = this.prevDropElement = null;
        },

        stop: function (event) {
            if (this.interacting()) {
                autoScroll.stop();
                this.matches = [];
                this.matchElements = [];

                var target = this.target;

                if (target.options.styleCursor) {
                    target._doc.documentElement.style.cursor = '';
                }

                // prevent Default only if were previously interacting
                if (event && isFunction(event.preventDefault)) {
                    this.checkAndPreventDefault(event, target, this.element);
                }

                if (this.dragging) {
                    this.activeDrops.dropzones = this.activeDrops.elements = this.activeDrops.rects = null;
                }
            }

            this.clearTargets();

            this.pointerIsDown = this.snapStatus.locked = this.dragging = this.resizing = this.gesturing = false;
            this.prepared.name = this.prevEvent = null;
            this.inertiaStatus.resumeDx = this.inertiaStatus.resumeDy = 0;

            // remove pointers if their ID isn't in this.pointerIds
            for (var i = 0; i < this.pointers.length; i++) {
                if (indexOf(this.pointerIds, getPointerId(this.pointers[i])) === -1) {
                    this.pointers.splice(i, 1);
                }
            }
        },

        inertiaFrame: function () {
            var inertiaStatus = this.inertiaStatus,
                options = this.target.options[this.prepared.name].inertia,
                lambda = options.resistance,
                t = new Date().getTime() / 1000 - inertiaStatus.t0;

            if (t < inertiaStatus.te) {

                var progress =  1 - (Math.exp(-lambda * t) - inertiaStatus.lambda_v0) / inertiaStatus.one_ve_v0;

                if (inertiaStatus.modifiedXe === inertiaStatus.xe && inertiaStatus.modifiedYe === inertiaStatus.ye) {
                    inertiaStatus.sx = inertiaStatus.xe * progress;
                    inertiaStatus.sy = inertiaStatus.ye * progress;
                }
                else {
                    var quadPoint = getQuadraticCurvePoint(
                            0, 0,
                            inertiaStatus.xe, inertiaStatus.ye,
                            inertiaStatus.modifiedXe, inertiaStatus.modifiedYe,
                            progress);

                    inertiaStatus.sx = quadPoint.x;
                    inertiaStatus.sy = quadPoint.y;
                }

                this.pointerMove(inertiaStatus.startEvent, inertiaStatus.startEvent);

                inertiaStatus.i = reqFrame(this.boundInertiaFrame);
            }
            else {
                inertiaStatus.ending = true;

                inertiaStatus.sx = inertiaStatus.modifiedXe;
                inertiaStatus.sy = inertiaStatus.modifiedYe;

                this.pointerMove(inertiaStatus.startEvent, inertiaStatus.startEvent);
                this.pointerEnd(inertiaStatus.startEvent, inertiaStatus.startEvent);

                inertiaStatus.active = inertiaStatus.ending = false;
            }
        },

        smoothEndFrame: function () {
            var inertiaStatus = this.inertiaStatus,
                t = new Date().getTime() - inertiaStatus.t0,
                duration = this.target.options[this.prepared.name].inertia.smoothEndDuration;

            if (t < duration) {
                inertiaStatus.sx = easeOutQuad(t, 0, inertiaStatus.xe, duration);
                inertiaStatus.sy = easeOutQuad(t, 0, inertiaStatus.ye, duration);

                this.pointerMove(inertiaStatus.startEvent, inertiaStatus.startEvent);

                inertiaStatus.i = reqFrame(this.boundSmoothEndFrame);
            }
            else {
                inertiaStatus.ending = true;

                inertiaStatus.sx = inertiaStatus.xe;
                inertiaStatus.sy = inertiaStatus.ye;

                this.pointerMove(inertiaStatus.startEvent, inertiaStatus.startEvent);
                this.pointerEnd(inertiaStatus.startEvent, inertiaStatus.startEvent);

                inertiaStatus.smoothEnd =
                  inertiaStatus.active = inertiaStatus.ending = false;
            }
        },

        addPointer: function (pointer) {
            var id = getPointerId(pointer),
                index = this.mouse? 0 : indexOf(this.pointerIds, id);

            if (index === -1) {
                index = this.pointerIds.length;
            }

            this.pointerIds[index] = id;
            this.pointers[index] = pointer;

            return index;
        },

        removePointer: function (pointer) {
            var id = getPointerId(pointer),
                index = this.mouse? 0 : indexOf(this.pointerIds, id);

            if (index === -1) { return; }

            this.pointers   .splice(index, 1);
            this.pointerIds .splice(index, 1);
            this.downTargets.splice(index, 1);
            this.downTimes  .splice(index, 1);
            this.holdTimers .splice(index, 1);
        },

        recordPointer: function (pointer) {
            var index = this.mouse? 0: indexOf(this.pointerIds, getPointerId(pointer));

            if (index === -1) { return; }

            this.pointers[index] = pointer;
        },

        collectEventTargets: function (pointer, event, eventTarget, eventType) {
            var pointerIndex = this.mouse? 0 : indexOf(this.pointerIds, getPointerId(pointer));

            // do not fire a tap event if the pointer was moved before being lifted
            if (eventType === 'tap' && (this.pointerWasMoved
                // or if the pointerup target is different to the pointerdown target
                || !(this.downTargets[pointerIndex] && this.downTargets[pointerIndex] === eventTarget))) {
                return;
            }

            var targets = [],
                elements = [],
                element = eventTarget;

            function collectSelectors (interactable, selector, context) {
                var els = ie8MatchesSelector
                        ? context.querySelectorAll(selector)
                        : undefined;

                if (interactable._iEvents[eventType]
                    && isElement(element)
                    && inContext(interactable, element)
                    && !testIgnore(interactable, element, eventTarget)
                    && testAllow(interactable, element, eventTarget)
                    && matchesSelector(element, selector, els)) {

                    targets.push(interactable);
                    elements.push(element);
                }
            }

            while (element) {
                if (interact.isSet(element) && interact(element)._iEvents[eventType]) {
                    targets.push(interact(element));
                    elements.push(element);
                }

                interactables.forEachSelector(collectSelectors);

                element = parentElement(element);
            }

            // create the tap event even if there are no listeners so that
            // doubletap can still be created and fired
            if (targets.length || eventType === 'tap') {
                this.firePointers(pointer, event, eventTarget, targets, elements, eventType);
            }
        },

        firePointers: function (pointer, event, eventTarget, targets, elements, eventType) {
            var pointerIndex = this.mouse? 0 : indexOf(this.pointerIds, getPointerId(pointer)),
                pointerEvent = {},
                i,
                // for tap events
                interval, createNewDoubleTap;

            // if it's a doubletap then the event properties would have been
            // copied from the tap event and provided as the pointer argument
            if (eventType === 'doubletap') {
                pointerEvent = pointer;
            }
            else {
                pointerExtend(pointerEvent, event);
                if (event !== pointer) {
                    pointerExtend(pointerEvent, pointer);
                }

                pointerEvent.preventDefault           = preventOriginalDefault;
                pointerEvent.stopPropagation          = InteractEvent.prototype.stopPropagation;
                pointerEvent.stopImmediatePropagation = InteractEvent.prototype.stopImmediatePropagation;
                pointerEvent.interaction              = this;

                pointerEvent.timeStamp       = new Date().getTime();
                pointerEvent.originalEvent   = event;
                pointerEvent.originalPointer = pointer;
                pointerEvent.type            = eventType;
                pointerEvent.pointerId       = getPointerId(pointer);
                pointerEvent.pointerType     = this.mouse? 'mouse' : !supportsPointerEvent? 'touch'
                                                    : isString(pointer.pointerType)
                                                        ? pointer.pointerType
                                                        : [,,'touch', 'pen', 'mouse'][pointer.pointerType];
            }

            if (eventType === 'tap') {
                pointerEvent.dt = pointerEvent.timeStamp - this.downTimes[pointerIndex];

                interval = pointerEvent.timeStamp - this.tapTime;
                createNewDoubleTap = !!(this.prevTap && this.prevTap.type !== 'doubletap'
                       && this.prevTap.target === pointerEvent.target
                       && interval < 500);

                pointerEvent.double = createNewDoubleTap;

                this.tapTime = pointerEvent.timeStamp;
            }

            for (i = 0; i < targets.length; i++) {
                pointerEvent.currentTarget = elements[i];
                pointerEvent.interactable = targets[i];
                targets[i].fire(pointerEvent);

                if (pointerEvent.immediatePropagationStopped
                    ||(pointerEvent.propagationStopped && elements[i + 1] !== pointerEvent.currentTarget)) {
                    break;
                }
            }

            if (createNewDoubleTap) {
                var doubleTap = {};

                extend(doubleTap, pointerEvent);

                doubleTap.dt   = interval;
                doubleTap.type = 'doubletap';

                this.collectEventTargets(doubleTap, event, eventTarget, 'doubletap');

                this.prevTap = doubleTap;
            }
            else if (eventType === 'tap') {
                this.prevTap = pointerEvent;
            }
        },

        validateSelector: function (pointer, event, matches, matchElements) {
            for (var i = 0, len = matches.length; i < len; i++) {
                var match = matches[i],
                    matchElement = matchElements[i],
                    action = validateAction(match.getAction(pointer, event, this, matchElement), match);

                if (action && withinInteractionLimit(match, matchElement, action)) {
                    this.target = match;
                    this.element = matchElement;

                    return action;
                }
            }
        },

        setSnapping: function (pageCoords, status) {
            var snap = this.target.options[this.prepared.name].snap,
                targets = [],
                target,
                page,
                i;

            status = status || this.snapStatus;

            if (status.useStatusXY) {
                page = { x: status.x, y: status.y };
            }
            else {
                var origin = getOriginXY(this.target, this.element);

                page = extend({}, pageCoords);

                page.x -= origin.x;
                page.y -= origin.y;
            }

            status.realX = page.x;
            status.realY = page.y;

            page.x = page.x - this.inertiaStatus.resumeDx;
            page.y = page.y - this.inertiaStatus.resumeDy;

            var len = snap.targets? snap.targets.length : 0;

            for (var relIndex = 0; relIndex < this.snapOffsets.length; relIndex++) {
                var relative = {
                    x: page.x - this.snapOffsets[relIndex].x,
                    y: page.y - this.snapOffsets[relIndex].y
                };

                for (i = 0; i < len; i++) {
                    if (isFunction(snap.targets[i])) {
                        target = snap.targets[i](relative.x, relative.y, this);
                    }
                    else {
                        target = snap.targets[i];
                    }

                    if (!target) { continue; }

                    targets.push({
                        x: isNumber(target.x) ? (target.x + this.snapOffsets[relIndex].x) : relative.x,
                        y: isNumber(target.y) ? (target.y + this.snapOffsets[relIndex].y) : relative.y,

                        range: isNumber(target.range)? target.range: snap.range
                    });
                }
            }

            var closest = {
                    target: null,
                    inRange: false,
                    distance: 0,
                    range: 0,
                    dx: 0,
                    dy: 0
                };

            for (i = 0, len = targets.length; i < len; i++) {
                target = targets[i];

                var range = target.range,
                    dx = target.x - page.x,
                    dy = target.y - page.y,
                    distance = hypot(dx, dy),
                    inRange = distance <= range;

                // Infinite targets count as being out of range
                // compared to non infinite ones that are in range
                if (range === Infinity && closest.inRange && closest.range !== Infinity) {
                    inRange = false;
                }

                if (!closest.target || (inRange
                    // is the closest target in range?
                    ? (closest.inRange && range !== Infinity
                        // the pointer is relatively deeper in this target
                        ? distance / range < closest.distance / closest.range
                        // this target has Infinite range and the closest doesn't
                        : (range === Infinity && closest.range !== Infinity)
                            // OR this target is closer that the previous closest
                            || distance < closest.distance)
                    // The other is not in range and the pointer is closer to this target
                    : (!closest.inRange && distance < closest.distance))) {

                    if (range === Infinity) {
                        inRange = true;
                    }

                    closest.target = target;
                    closest.distance = distance;
                    closest.range = range;
                    closest.inRange = inRange;
                    closest.dx = dx;
                    closest.dy = dy;

                    status.range = range;
                }
            }

            var snapChanged;

            if (closest.target) {
                snapChanged = (status.snappedX !== closest.target.x || status.snappedY !== closest.target.y);

                status.snappedX = closest.target.x;
                status.snappedY = closest.target.y;
            }
            else {
                snapChanged = true;

                status.snappedX = NaN;
                status.snappedY = NaN;
            }

            status.dx = closest.dx;
            status.dy = closest.dy;

            status.changed = (snapChanged || (closest.inRange && !status.locked));
            status.locked = closest.inRange;

            return status;
        },

        setRestriction: function (pageCoords, status) {
            var target = this.target,
                restrict = target && target.options[this.prepared.name].restrict,
                restriction = restrict && restrict.restriction,
                page;

            if (!restriction) {
                return status;
            }

            status = status || this.restrictStatus;

            page = status.useStatusXY
                    ? page = { x: status.x, y: status.y }
                    : page = extend({}, pageCoords);

            if (status.snap && status.snap.locked) {
                page.x += status.snap.dx || 0;
                page.y += status.snap.dy || 0;
            }

            page.x -= this.inertiaStatus.resumeDx;
            page.y -= this.inertiaStatus.resumeDy;

            status.dx = 0;
            status.dy = 0;
            status.restricted = false;

            var rect, restrictedX, restrictedY;

            if (isString(restriction)) {
                if (restriction === 'parent') {
                    restriction = parentElement(this.element);
                }
                else if (restriction === 'self') {
                    restriction = target.getRect(this.element);
                }
                else {
                    restriction = closest(this.element, restriction);
                }

                if (!restriction) { return status; }
            }

            if (isFunction(restriction)) {
                restriction = restriction(page.x, page.y, this.element);
            }

            if (isElement(restriction)) {
                restriction = getElementRect(restriction);
            }

            rect = restriction;

            if (!restriction) {
                restrictedX = page.x;
                restrictedY = page.y;
            }
            // object is assumed to have
            // x, y, width, height or
            // left, top, right, bottom
            else if ('x' in restriction && 'y' in restriction) {
                restrictedX = Math.max(Math.min(rect.x + rect.width  - this.restrictOffset.right , page.x), rect.x + this.restrictOffset.left);
                restrictedY = Math.max(Math.min(rect.y + rect.height - this.restrictOffset.bottom, page.y), rect.y + this.restrictOffset.top );
            }
            else {
                restrictedX = Math.max(Math.min(rect.right  - this.restrictOffset.right , page.x), rect.left + this.restrictOffset.left);
                restrictedY = Math.max(Math.min(rect.bottom - this.restrictOffset.bottom, page.y), rect.top  + this.restrictOffset.top );
            }

            status.dx = restrictedX - page.x;
            status.dy = restrictedY - page.y;

            status.changed = status.restrictedX !== restrictedX || status.restrictedY !== restrictedY;
            status.restricted = !!(status.dx || status.dy);

            status.restrictedX = restrictedX;
            status.restrictedY = restrictedY;

            return status;
        },

        checkAndPreventDefault: function (event, interactable, element) {
            if (!(interactable = interactable || this.target)) { return; }

            var options = interactable.options,
                prevent = options.preventDefault;

            if (prevent === 'auto' && element && !/^(input|select|textarea)$/i.test(event.target.nodeName)) {
                // do not preventDefault on pointerdown if the prepared action is a drag
                // and dragging can only start from a certain direction - this allows
                // a touch to pan the viewport if a drag isn't in the right direction
                if (/down|start/i.test(event.type)
                    && this.prepared.name === 'drag' && options.drag.axis !== 'xy') {

                    return;
                }

                // with manualStart, only preventDefault while interacting
                if (options[this.prepared.name] && options[this.prepared.name].manualStart
                    && !this.interacting()) {
                    return;
                }

                event.preventDefault();
                return;
            }

            if (prevent === 'always') {
                event.preventDefault();
                return;
            }
        },

        calcInertia: function (status) {
            var inertiaOptions = this.target.options[this.prepared.name].inertia,
                lambda = inertiaOptions.resistance,
                inertiaDur = -Math.log(inertiaOptions.endSpeed / status.v0) / lambda;

            status.x0 = this.prevEvent.pageX;
            status.y0 = this.prevEvent.pageY;
            status.t0 = status.startEvent.timeStamp / 1000;
            status.sx = status.sy = 0;

            status.modifiedXe = status.xe = (status.vx0 - inertiaDur) / lambda;
            status.modifiedYe = status.ye = (status.vy0 - inertiaDur) / lambda;
            status.te = inertiaDur;

            status.lambda_v0 = lambda / status.v0;
            status.one_ve_v0 = 1 - inertiaOptions.endSpeed / status.v0;
        },

        autoScrollMove: function (pointer) {
            if (!(this.interacting()
                && checkAutoScroll(this.target, this.prepared.name))) {
                return;
            }

            if (this.inertiaStatus.active) {
                autoScroll.x = autoScroll.y = 0;
                return;
            }

            var top,
                right,
                bottom,
                left,
                options = this.target.options[this.prepared.name].autoScroll,
                container = options.container || getWindow(this.element);

            if (isWindow(container)) {
                left   = pointer.clientX < autoScroll.margin;
                top    = pointer.clientY < autoScroll.margin;
                right  = pointer.clientX > container.innerWidth  - autoScroll.margin;
                bottom = pointer.clientY > container.innerHeight - autoScroll.margin;
            }
            else {
                var rect = getElementClientRect(container);

                left   = pointer.clientX < rect.left   + autoScroll.margin;
                top    = pointer.clientY < rect.top    + autoScroll.margin;
                right  = pointer.clientX > rect.right  - autoScroll.margin;
                bottom = pointer.clientY > rect.bottom - autoScroll.margin;
            }

            autoScroll.x = (right ? 1: left? -1: 0);
            autoScroll.y = (bottom? 1:  top? -1: 0);

            if (!autoScroll.isScrolling) {
                // set the autoScroll properties to those of the target
                autoScroll.margin = options.margin;
                autoScroll.speed  = options.speed;

                autoScroll.start(this);
            }
        },

        _updateEventTargets: function (target, currentTarget) {
            this._eventTarget    = target;
            this._curEventTarget = currentTarget;
        }

    };

    function getInteractionFromPointer (pointer, eventType, eventTarget) {
        var i = 0, len = interactions.length,
            mouseEvent = (/mouse/i.test(pointer.pointerType || eventType)
                          // MSPointerEvent.MSPOINTER_TYPE_MOUSE
                          || pointer.pointerType === 4),
            interaction;

        var id = getPointerId(pointer);

        // try to resume inertia with a new pointer
        if (/down|start/i.test(eventType)) {
            for (i = 0; i < len; i++) {
                interaction = interactions[i];

                var element = eventTarget;

                if (interaction.inertiaStatus.active && interaction.target.options[interaction.prepared.name].inertia.allowResume
                    && (interaction.mouse === mouseEvent)) {
                    while (element) {
                        // if the element is the interaction element
                        if (element === interaction.element) {
                            return interaction;
                        }
                        element = parentElement(element);
                    }
                }
            }
        }

        // if it's a mouse interaction
        if (mouseEvent || !(supportsTouch || supportsPointerEvent)) {

            // find a mouse interaction that's not in inertia phase
            for (i = 0; i < len; i++) {
                if (interactions[i].mouse && !interactions[i].inertiaStatus.active) {
                    return interactions[i];
                }
            }

            // find any interaction specifically for mouse.
            // if the eventType is a mousedown, and inertia is active
            // ignore the interaction
            for (i = 0; i < len; i++) {
                if (interactions[i].mouse && !(/down/.test(eventType) && interactions[i].inertiaStatus.active)) {
                    return interaction;
                }
            }

            // create a new interaction for mouse
            interaction = new Interaction();
            interaction.mouse = true;

            return interaction;
        }

        // get interaction that has this pointer
        for (i = 0; i < len; i++) {
            if (contains(interactions[i].pointerIds, id)) {
                return interactions[i];
            }
        }

        // at this stage, a pointerUp should not return an interaction
        if (/up|end|out/i.test(eventType)) {
            return null;
        }

        // get first idle interaction
        for (i = 0; i < len; i++) {
            interaction = interactions[i];

            if ((!interaction.prepared.name || (interaction.target.options.gesture.enabled))
                && !interaction.interacting()
                && !(!mouseEvent && interaction.mouse)) {

                return interaction;
            }
        }

        return new Interaction();
    }

    function doOnInteractions (method) {
        return (function (event) {
            var interaction,
                eventTarget = getActualElement(event.path
                                               ? event.path[0]
                                               : event.target),
                curEventTarget = getActualElement(event.currentTarget),
                i;

            if (supportsTouch && /touch/.test(event.type)) {
                prevTouchTime = new Date().getTime();

                for (i = 0; i < event.changedTouches.length; i++) {
                    var pointer = event.changedTouches[i];

                    interaction = getInteractionFromPointer(pointer, event.type, eventTarget);

                    if (!interaction) { continue; }

                    interaction._updateEventTargets(eventTarget, curEventTarget);

                    interaction[method](pointer, event, eventTarget, curEventTarget);
                }
            }
            else {
                if (!supportsPointerEvent && /mouse/.test(event.type)) {
                    // ignore mouse events while touch interactions are active
                    for (i = 0; i < interactions.length; i++) {
                        if (!interactions[i].mouse && interactions[i].pointerIsDown) {
                            return;
                        }
                    }

                    // try to ignore mouse events that are simulated by the browser
                    // after a touch event
                    if (new Date().getTime() - prevTouchTime < 500) {
                        return;
                    }
                }

                interaction = getInteractionFromPointer(event, event.type, eventTarget);

                if (!interaction) { return; }

                interaction._updateEventTargets(eventTarget, curEventTarget);

                interaction[method](event, event, eventTarget, curEventTarget);
            }
        });
    }

    function InteractEvent (interaction, event, action, phase, element, related) {
        var client,
            page,
            target      = interaction.target,
            snapStatus  = interaction.snapStatus,
            restrictStatus  = interaction.restrictStatus,
            pointers    = interaction.pointers,
            deltaSource = (target && target.options || defaultOptions).deltaSource,
            sourceX     = deltaSource + 'X',
            sourceY     = deltaSource + 'Y',
            options     = target? target.options: defaultOptions,
            origin      = getOriginXY(target, element),
            starting    = phase === 'start',
            ending      = phase === 'end',
            coords      = starting? interaction.startCoords : interaction.curCoords;

        element = element || interaction.element;

        page   = extend({}, coords.page);
        client = extend({}, coords.client);

        page.x -= origin.x;
        page.y -= origin.y;

        client.x -= origin.x;
        client.y -= origin.y;

        var relativePoints = options[action].snap && options[action].snap.relativePoints ;

        if (checkSnap(target, action) && !(starting && relativePoints && relativePoints.length)) {
            this.snap = {
                range  : snapStatus.range,
                locked : snapStatus.locked,
                x      : snapStatus.snappedX,
                y      : snapStatus.snappedY,
                realX  : snapStatus.realX,
                realY  : snapStatus.realY,
                dx     : snapStatus.dx,
                dy     : snapStatus.dy
            };

            if (snapStatus.locked) {
                page.x += snapStatus.dx;
                page.y += snapStatus.dy;
                client.x += snapStatus.dx;
                client.y += snapStatus.dy;
            }
        }

        if (checkRestrict(target, action) && !(starting && options[action].restrict.elementRect) && restrictStatus.restricted) {
            page.x += restrictStatus.dx;
            page.y += restrictStatus.dy;
            client.x += restrictStatus.dx;
            client.y += restrictStatus.dy;

            this.restrict = {
                dx: restrictStatus.dx,
                dy: restrictStatus.dy
            };
        }

        this.pageX     = page.x;
        this.pageY     = page.y;
        this.clientX   = client.x;
        this.clientY   = client.y;

        this.x0        = interaction.startCoords.page.x - origin.x;
        this.y0        = interaction.startCoords.page.y - origin.y;
        this.clientX0  = interaction.startCoords.client.x - origin.x;
        this.clientY0  = interaction.startCoords.client.y - origin.y;
        this.ctrlKey   = event.ctrlKey;
        this.altKey    = event.altKey;
        this.shiftKey  = event.shiftKey;
        this.metaKey   = event.metaKey;
        this.button    = event.button;
        this.buttons   = event.buttons;
        this.target    = element;
        this.t0        = interaction.downTimes[0];
        this.type      = action + (phase || '');

        this.interaction = interaction;
        this.interactable = target;

        var inertiaStatus = interaction.inertiaStatus;

        if (inertiaStatus.active) {
            this.detail = 'inertia';
        }

        if (related) {
            this.relatedTarget = related;
        }

        // end event dx, dy is difference between start and end points
        if (ending) {
            if (deltaSource === 'client') {
                this.dx = client.x - interaction.startCoords.client.x;
                this.dy = client.y - interaction.startCoords.client.y;
            }
            else {
                this.dx = page.x - interaction.startCoords.page.x;
                this.dy = page.y - interaction.startCoords.page.y;
            }
        }
        else if (starting) {
            this.dx = 0;
            this.dy = 0;
        }
        // copy properties from previousmove if starting inertia
        else if (phase === 'inertiastart') {
            this.dx = interaction.prevEvent.dx;
            this.dy = interaction.prevEvent.dy;
        }
        else {
            if (deltaSource === 'client') {
                this.dx = client.x - interaction.prevEvent.clientX;
                this.dy = client.y - interaction.prevEvent.clientY;
            }
            else {
                this.dx = page.x - interaction.prevEvent.pageX;
                this.dy = page.y - interaction.prevEvent.pageY;
            }
        }
        if (interaction.prevEvent && interaction.prevEvent.detail === 'inertia'
            && !inertiaStatus.active
            && options[action].inertia && options[action].inertia.zeroResumeDelta) {

            inertiaStatus.resumeDx += this.dx;
            inertiaStatus.resumeDy += this.dy;

            this.dx = this.dy = 0;
        }

        if (action === 'resize' && interaction.resizeAxes) {
            if (options.resize.square) {
                if (interaction.resizeAxes === 'y') {
                    this.dx = this.dy;
                }
                else {
                    this.dy = this.dx;
                }
                this.axes = 'xy';
            }
            else {
                this.axes = interaction.resizeAxes;

                if (interaction.resizeAxes === 'x') {
                    this.dy = 0;
                }
                else if (interaction.resizeAxes === 'y') {
                    this.dx = 0;
                }
            }
        }
        else if (action === 'gesture') {
            this.touches = [pointers[0], pointers[1]];

            if (starting) {
                this.distance = touchDistance(pointers, deltaSource);
                this.box      = touchBBox(pointers);
                this.scale    = 1;
                this.ds       = 0;
                this.angle    = touchAngle(pointers, undefined, deltaSource);
                this.da       = 0;
            }
            else if (ending || event instanceof InteractEvent) {
                this.distance = interaction.prevEvent.distance;
                this.box      = interaction.prevEvent.box;
                this.scale    = interaction.prevEvent.scale;
                this.ds       = this.scale - 1;
                this.angle    = interaction.prevEvent.angle;
                this.da       = this.angle - interaction.gesture.startAngle;
            }
            else {
                this.distance = touchDistance(pointers, deltaSource);
                this.box      = touchBBox(pointers);
                this.scale    = this.distance / interaction.gesture.startDistance;
                this.angle    = touchAngle(pointers, interaction.gesture.prevAngle, deltaSource);

                this.ds = this.scale - interaction.gesture.prevScale;
                this.da = this.angle - interaction.gesture.prevAngle;
            }
        }

        if (starting) {
            this.timeStamp = interaction.downTimes[0];
            this.dt        = 0;
            this.duration  = 0;
            this.speed     = 0;
            this.velocityX = 0;
            this.velocityY = 0;
        }
        else if (phase === 'inertiastart') {
            this.timeStamp = interaction.prevEvent.timeStamp;
            this.dt        = interaction.prevEvent.dt;
            this.duration  = interaction.prevEvent.duration;
            this.speed     = interaction.prevEvent.speed;
            this.velocityX = interaction.prevEvent.velocityX;
            this.velocityY = interaction.prevEvent.velocityY;
        }
        else {
            this.timeStamp = new Date().getTime();
            this.dt        = this.timeStamp - interaction.prevEvent.timeStamp;
            this.duration  = this.timeStamp - interaction.downTimes[0];

            if (event instanceof InteractEvent) {
                var dx = this[sourceX] - interaction.prevEvent[sourceX],
                    dy = this[sourceY] - interaction.prevEvent[sourceY],
                    dt = this.dt / 1000;

                this.speed = hypot(dx, dy) / dt;
                this.velocityX = dx / dt;
                this.velocityY = dy / dt;
            }
            // if normal move or end event, use previous user event coords
            else {
                // speed and velocity in pixels per second
                this.speed = interaction.pointerDelta[deltaSource].speed;
                this.velocityX = interaction.pointerDelta[deltaSource].vx;
                this.velocityY = interaction.pointerDelta[deltaSource].vy;
            }
        }

        if ((ending || phase === 'inertiastart')
            && interaction.prevEvent.speed > 600 && this.timeStamp - interaction.prevEvent.timeStamp < 150) {

            var angle = 180 * Math.atan2(interaction.prevEvent.velocityY, interaction.prevEvent.velocityX) / Math.PI,
                overlap = 22.5;

            if (angle < 0) {
                angle += 360;
            }

            var left = 135 - overlap <= angle && angle < 225 + overlap,
                up   = 225 - overlap <= angle && angle < 315 + overlap,

                right = !left && (315 - overlap <= angle || angle <  45 + overlap),
                down  = !up   &&   45 - overlap <= angle && angle < 135 + overlap;

            this.swipe = {
                up   : up,
                down : down,
                left : left,
                right: right,
                angle: angle,
                speed: interaction.prevEvent.speed,
                velocity: {
                    x: interaction.prevEvent.velocityX,
                    y: interaction.prevEvent.velocityY
                }
            };
        }
    }

    InteractEvent.prototype = {
        preventDefault: blank,
        stopImmediatePropagation: function () {
            this.immediatePropagationStopped = this.propagationStopped = true;
        },
        stopPropagation: function () {
            this.propagationStopped = true;
        }
    };

    function preventOriginalDefault () {
        this.originalEvent.preventDefault();
    }

    function getActionCursor (action) {
        var cursor = '';

        if (action.name === 'drag') {
            cursor =  actionCursors.drag;
        }
        if (action.name === 'resize') {
            if (action.axis) {
                cursor =  actionCursors[action.name + action.axis];
            }
            else if (action.edges) {
                var cursorKey = 'resize',
                    edgeNames = ['top', 'bottom', 'left', 'right'];

                for (var i = 0; i < 4; i++) {
                    if (action.edges[edgeNames[i]]) {
                        cursorKey += edgeNames[i];
                    }
                }

                cursor = actionCursors[cursorKey];
            }
        }

        return cursor;
    }

    function checkResizeEdge (name, value, page, element, interactableElement, rect, margin) {
        // false, '', undefined, null
        if (!value) { return false; }

        // true value, use pointer coords and element rect
        if (value === true) {
            // if dimensions are negative, "switch" edges
            var width = isNumber(rect.width)? rect.width : rect.right - rect.left,
                height = isNumber(rect.height)? rect.height : rect.bottom - rect.top;

            if (width < 0) {
                if      (name === 'left' ) { name = 'right'; }
                else if (name === 'right') { name = 'left' ; }
            }
            if (height < 0) {
                if      (name === 'top'   ) { name = 'bottom'; }
                else if (name === 'bottom') { name = 'top'   ; }
            }

            if (name === 'left'  ) { return page.x < ((width  >= 0? rect.left: rect.right ) + margin); }
            if (name === 'top'   ) { return page.y < ((height >= 0? rect.top : rect.bottom) + margin); }

            if (name === 'right' ) { return page.x > ((width  >= 0? rect.right : rect.left) - margin); }
            if (name === 'bottom') { return page.y > ((height >= 0? rect.bottom: rect.top ) - margin); }
        }

        // the remaining checks require an element
        if (!isElement(element)) { return false; }

        return isElement(value)
                    // the value is an element to use as a resize handle
                    ? value === element
                    // otherwise check if element matches value as selector
                    : matchesUpTo(element, value, interactableElement);
    }

    function defaultActionChecker (pointer, interaction, element) {
        var rect = this.getRect(element),
            shouldResize = false,
            action = null,
            resizeAxes = null,
            resizeEdges,
            page = extend({}, interaction.curCoords.page),
            options = this.options;

        if (!rect) { return null; }

        if (actionIsEnabled.resize && options.resize.enabled) {
            var resizeOptions = options.resize;

            resizeEdges = {
                left: false, right: false, top: false, bottom: false
            };

            // if using resize.edges
            if (isObject(resizeOptions.edges)) {
                for (var edge in resizeEdges) {
                    resizeEdges[edge] = checkResizeEdge(edge,
                                                        resizeOptions.edges[edge],
                                                        page,
                                                        interaction._eventTarget,
                                                        element,
                                                        rect,
                                                        resizeOptions.margin || margin);
                }

                resizeEdges.left = resizeEdges.left && !resizeEdges.right;
                resizeEdges.top  = resizeEdges.top  && !resizeEdges.bottom;

                shouldResize = resizeEdges.left || resizeEdges.right || resizeEdges.top || resizeEdges.bottom;
            }
            else {
                var right  = options.resize.axis !== 'y' && page.x > (rect.right  - margin),
                    bottom = options.resize.axis !== 'x' && page.y > (rect.bottom - margin);

                shouldResize = right || bottom;
                resizeAxes = (right? 'x' : '') + (bottom? 'y' : '');
            }
        }

        action = shouldResize
            ? 'resize'
            : actionIsEnabled.drag && options.drag.enabled
                ? 'drag'
                : null;

        if (actionIsEnabled.gesture
            && interaction.pointerIds.length >=2
            && !(interaction.dragging || interaction.resizing)) {
            action = 'gesture';
        }

        if (action) {
            return {
                name: action,
                axis: resizeAxes,
                edges: resizeEdges
            };
        }

        return null;
    }

    // Check if action is enabled globally and the current target supports it
    // If so, return the validated action. Otherwise, return null
    function validateAction (action, interactable) {
        if (!isObject(action)) { return null; }

        var actionName = action.name,
            options = interactable.options;

        if ((  (actionName  === 'resize'   && options.resize.enabled )
            || (actionName      === 'drag'     && options.drag.enabled  )
            || (actionName      === 'gesture'  && options.gesture.enabled))
            && actionIsEnabled[actionName]) {

            if (actionName === 'resize' || actionName === 'resizeyx') {
                actionName = 'resizexy';
            }

            return action;
        }
        return null;
    }

    var listeners = {},
        interactionListeners = [
            'dragStart', 'dragMove', 'resizeStart', 'resizeMove', 'gestureStart', 'gestureMove',
            'pointerOver', 'pointerOut', 'pointerHover', 'selectorDown',
            'pointerDown', 'pointerMove', 'pointerUp', 'pointerCancel', 'pointerEnd',
            'addPointer', 'removePointer', 'recordPointer', 'autoScrollMove'
        ];

    for (var i = 0, len = interactionListeners.length; i < len; i++) {
        var name = interactionListeners[i];

        listeners[name] = doOnInteractions(name);
    }

    // bound to the interactable context when a DOM event
    // listener is added to a selector interactable
    function delegateListener (event, useCapture) {
        var fakeEvent = {},
            delegated = delegatedEvents[event.type],
            eventTarget = getActualElement(event.path
                                           ? event.path[0]
                                           : event.target),
            element = eventTarget;

        useCapture = useCapture? true: false;

        // duplicate the event so that currentTarget can be changed
        for (var prop in event) {
            fakeEvent[prop] = event[prop];
        }

        fakeEvent.originalEvent = event;
        fakeEvent.preventDefault = preventOriginalDefault;

        // climb up document tree looking for selector matches
        while (isElement(element)) {
            for (var i = 0; i < delegated.selectors.length; i++) {
                var selector = delegated.selectors[i],
                    context = delegated.contexts[i];

                if (matchesSelector(element, selector)
                    && nodeContains(context, eventTarget)
                    && nodeContains(context, element)) {

                    var listeners = delegated.listeners[i];

                    fakeEvent.currentTarget = element;

                    for (var j = 0; j < listeners.length; j++) {
                        if (listeners[j][1] === useCapture) {
                            listeners[j][0](fakeEvent);
                        }
                    }
                }
            }

            element = parentElement(element);
        }
    }

    function delegateUseCapture (event) {
        return delegateListener.call(this, event, true);
    }

    interactables.indexOfElement = function indexOfElement (element, context) {
        context = context || document;

        for (var i = 0; i < this.length; i++) {
            var interactable = this[i];

            if ((interactable.selector === element
                && (interactable._context === context))
                || (!interactable.selector && interactable._element === element)) {

                return i;
            }
        }
        return -1;
    };

    interactables.get = function interactableGet (element, options) {
        return this[this.indexOfElement(element, options && options.context)];
    };

    interactables.forEachSelector = function (callback) {
        for (var i = 0; i < this.length; i++) {
            var interactable = this[i];

            if (!interactable.selector) {
                continue;
            }

            var ret = callback(interactable, interactable.selector, interactable._context, i, this);

            if (ret !== undefined) {
                return ret;
            }
        }
    };

    /*\
     * interact
     [ method ]
     *
     * The methods of this variable can be used to set elements as
     * interactables and also to change various default settings.
     *
     * Calling it as a function and passing an element or a valid CSS selector
     * string returns an Interactable object which has various methods to
     * configure it.
     *
     - element (Element | string) The HTML or SVG Element to interact with or CSS selector
     = (object) An @Interactable
     *
     > Usage
     | interact(document.getElementById('draggable')).draggable(true);
     |
     | var rectables = interact('rect');
     | rectables
     |     .gesturable(true)
     |     .on('gesturemove', function (event) {
     |         // something cool...
     |     })
     |     .autoScroll(true);
    \*/
    function interact (element, options) {
        return interactables.get(element, options) || new Interactable(element, options);
    }

    /*\
     * Interactable
     [ property ]
     **
     * Object type returned by @interact
    \*/
    function Interactable (element, options) {
        this._element = element;
        this._iEvents = this._iEvents || {};

        var _window;

        if (trySelector(element)) {
            this.selector = element;

            var context = options && options.context;

            _window = context? getWindow(context) : window;

            if (context && (_window.Node
                    ? context instanceof _window.Node
                    : (isElement(context) || context === _window.document))) {

                this._context = context;
            }
        }
        else {
            _window = getWindow(element);

            if (isElement(element, _window)) {

                if (PointerEvent) {
                    events.add(this._element, pEventTypes.down, listeners.pointerDown );
                    events.add(this._element, pEventTypes.move, listeners.pointerHover);
                }
                else {
                    events.add(this._element, 'mousedown' , listeners.pointerDown );
                    events.add(this._element, 'mousemove' , listeners.pointerHover);
                    events.add(this._element, 'touchstart', listeners.pointerDown );
                    events.add(this._element, 'touchmove' , listeners.pointerHover);
                }
            }
        }

        this._doc = _window.document;

        if (!contains(documents, this._doc)) {
            listenToDocument(this._doc);
        }

        interactables.push(this);

        this.set(options);
    }

    Interactable.prototype = {
        setOnEvents: function (action, phases) {
            if (action === 'drop') {
                if (isFunction(phases.ondrop)          ) { this.ondrop           = phases.ondrop          ; }
                if (isFunction(phases.ondropactivate)  ) { this.ondropactivate   = phases.ondropactivate  ; }
                if (isFunction(phases.ondropdeactivate)) { this.ondropdeactivate = phases.ondropdeactivate; }
                if (isFunction(phases.ondragenter)     ) { this.ondragenter      = phases.ondragenter     ; }
                if (isFunction(phases.ondragleave)     ) { this.ondragleave      = phases.ondragleave     ; }
                if (isFunction(phases.ondropmove)      ) { this.ondropmove       = phases.ondropmove      ; }
            }
            else {
                action = 'on' + action;

                if (isFunction(phases.onstart)       ) { this[action + 'start'         ] = phases.onstart         ; }
                if (isFunction(phases.onmove)        ) { this[action + 'move'          ] = phases.onmove          ; }
                if (isFunction(phases.onend)         ) { this[action + 'end'           ] = phases.onend           ; }
                if (isFunction(phases.oninertiastart)) { this[action + 'inertiastart'  ] = phases.oninertiastart  ; }
            }

            return this;
        },

        /*\
         * Interactable.draggable
         [ method ]
         *
         * Gets or sets whether drag actions can be performed on the
         * Interactable
         *
         = (boolean) Indicates if this can be the target of drag events
         | var isDraggable = interact('ul li').draggable();
         * or
         - options (boolean | object) #optional true/false or An object with event listeners to be fired on drag events (object makes the Interactable draggable)
         = (object) This Interactable
         | interact(element).draggable({
         |     onstart: function (event) {},
         |     onmove : function (event) {},
         |     onend  : function (event) {},
         |
         |     // the axis in which the first movement must be
         |     // for the drag sequence to start
         |     // 'xy' by default - any direction
         |     axis: 'x' || 'y' || 'xy',
         |
         |     // max number of drags that can happen concurrently
         |     // with elements of this Interactable. Infinity by default
         |     max: Infinity,
         |
         |     // max number of drags that can target the same element+Interactable
         |     // 1 by default
         |     maxPerElement: 2
         | });
        \*/
        draggable: function (options) {
            if (isObject(options)) {
                this.options.drag.enabled = options.enabled === false? false: true;
                this.setPerAction('drag', options);
                this.setOnEvents('drag', options);

                if (/^x$|^y$|^xy$/.test(options.axis)) {
                    this.options.drag.axis = options.axis;
                }
                else if (options.axis === null) {
                    delete this.options.drag.axis;
                }

                return this;
            }

            if (isBool(options)) {
                this.options.drag.enabled = options;

                return this;
            }

            return this.options.drag;
        },

        setPerAction: function (action, options) {
            // for all the default per-action options
            for (var option in options) {
                // if this option exists for this action
                if (option in defaultOptions[action]) {
                    // if the option in the options arg is an object value
                    if (isObject(options[option])) {
                        // duplicate the object
                        this.options[action][option] = extend(this.options[action][option] || {}, options[option]);

                        if (isObject(defaultOptions.perAction[option]) && 'enabled' in defaultOptions.perAction[option]) {
                            this.options[action][option].enabled = options[option].enabled === false? false : true;
                        }
                    }
                    else if (isBool(options[option]) && isObject(defaultOptions.perAction[option])) {
                        this.options[action][option].enabled = options[option];
                    }
                    else if (options[option] !== undefined) {
                        // or if it's not undefined, do a plain assignment
                        this.options[action][option] = options[option];
                    }
                }
            }
        },

        /*\
         * Interactable.dropzone
         [ method ]
         *
         * Returns or sets whether elements can be dropped onto this
         * Interactable to trigger drop events
         *
         * Dropzones can receive the following events:
         *  - `dropactivate` and `dropdeactivate` when an acceptable drag starts and ends
         *  - `dragenter` and `dragleave` when a draggable enters and leaves the dropzone
         *  - `dragmove` when a draggable that has entered the dropzone is moved
         *  - `drop` when a draggable is dropped into this dropzone
         *
         *  Use the `accept` option to allow only elements that match the given CSS selector or element.
         *
         *  Use the `overlap` option to set how drops are checked for. The allowed values are:
         *   - `'pointer'`, the pointer must be over the dropzone (default)
         *   - `'center'`, the draggable element's center must be over the dropzone
         *   - a number from 0-1 which is the `(intersection area) / (draggable area)`.
         *       e.g. `0.5` for drop to happen when half of the area of the
         *       draggable is over the dropzone
         *
         - options (boolean | object | null) #optional The new value to be set.
         | interact('.drop').dropzone({
         |   accept: '.can-drop' || document.getElementById('single-drop'),
         |   overlap: 'pointer' || 'center' || zeroToOne
         | }
         = (boolean | object) The current setting or this Interactable
        \*/
        dropzone: function (options) {
            if (isObject(options)) {
                this.options.drop.enabled = options.enabled === false? false: true;
                this.setOnEvents('drop', options);

                if (/^(pointer|center)$/.test(options.overlap)) {
                    this.options.drop.overlap = options.overlap;
                }
                else if (isNumber(options.overlap)) {
                    this.options.drop.overlap = Math.max(Math.min(1, options.overlap), 0);
                }
                if ('accept' in options) {
                  this.options.drop.accept = options.accept;
                }
                if ('checker' in options) {
                  this.options.drop.checker = options.checker;
                }

                return this;
            }

            if (isBool(options)) {
                this.options.drop.enabled = options;

                return this;
            }

            return this.options.drop;
        },

        dropCheck: function (dragEvent, event, draggable, draggableElement, dropElement, rect) {
            var dropped = false;

            // if the dropzone has no rect (eg. display: none)
            // call the custom dropChecker or just return false
            if (!(rect = rect || this.getRect(dropElement))) {
                return (this.options.drop.checker
                    ? this.options.drop.checker(dragEvent, event, dropped, this, dropElement, draggable, draggableElement)
                    : false);
            }

            var dropOverlap = this.options.drop.overlap;

            if (dropOverlap === 'pointer') {
                var page = getPageXY(dragEvent),
                    origin = getOriginXY(draggable, draggableElement),
                    horizontal,
                    vertical;

                page.x += origin.x;
                page.y += origin.y;

                horizontal = (page.x > rect.left) && (page.x < rect.right);
                vertical   = (page.y > rect.top ) && (page.y < rect.bottom);

                dropped = horizontal && vertical;
            }

            var dragRect = draggable.getRect(draggableElement);

            if (dropOverlap === 'center') {
                var cx = dragRect.left + dragRect.width  / 2,
                    cy = dragRect.top  + dragRect.height / 2;

                dropped = cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom;
            }

            if (isNumber(dropOverlap)) {
                var overlapArea  = (Math.max(0, Math.min(rect.right , dragRect.right ) - Math.max(rect.left, dragRect.left))
                                  * Math.max(0, Math.min(rect.bottom, dragRect.bottom) - Math.max(rect.top , dragRect.top ))),
                    overlapRatio = overlapArea / (dragRect.width * dragRect.height);

                dropped = overlapRatio >= dropOverlap;
            }

            if (this.options.drop.checker) {
                dropped = this.options.drop.checker(dragEvent, event, dropped, this, dropElement, draggable, draggableElement);
            }

            return dropped;
        },

        /*\
         * Interactable.dropChecker
         [ method ]
         *
         * DEPRECATED. Use interactable.dropzone({ checker: function... }) instead.
         *
         * Gets or sets the function used to check if a dragged element is
         * over this Interactable.
         *
         - checker (function) #optional The function that will be called when checking for a drop
         = (Function | Interactable) The checker function or this Interactable
         *
         * The checker function takes the following arguments:
         *
         - dragEvent (InteractEvent) The related dragmove or dragend event
         - event (TouchEvent | PointerEvent | MouseEvent) The user move/up/end Event related to the dragEvent
         - dropped (boolean) The value from the default drop checker
         - dropzone (Interactable) The dropzone interactable
         - dropElement (Element) The dropzone element
         - draggable (Interactable) The Interactable being dragged
         - draggableElement (Element) The actual element that's being dragged
         *
         > Usage:
         | interact(target)
         | .dropChecker(function(dragEvent,         // related dragmove or dragend event
         |                       event,             // TouchEvent/PointerEvent/MouseEvent
         |                       dropped,           // bool result of the default checker
         |                       dropzone,          // dropzone Interactable
         |                       dropElement,       // dropzone elemnt
         |                       draggable,         // draggable Interactable
         |                       draggableElement) {// draggable element
         |
         |   return dropped && event.target.hasAttribute('allow-drop');
         | }
        \*/
        dropChecker: function (checker) {
            if (isFunction(checker)) {
                this.options.drop.checker = checker;

                return this;
            }
            if (checker === null) {
                delete this.options.getRect;

                return this;
            }

            return this.options.drop.checker;
        },

        /*\
         * Interactable.accept
         [ method ]
         *
         * Deprecated. add an `accept` property to the options object passed to
         * @Interactable.dropzone instead.
         *
         * Gets or sets the Element or CSS selector match that this
         * Interactable accepts if it is a dropzone.
         *
         - newValue (Element | string | null) #optional
         * If it is an Element, then only that element can be dropped into this dropzone.
         * If it is a string, the element being dragged must match it as a selector.
         * If it is null, the accept options is cleared - it accepts any element.
         *
         = (string | Element | null | Interactable) The current accept option if given `undefined` or this Interactable
        \*/
        accept: function (newValue) {
            if (isElement(newValue)) {
                this.options.drop.accept = newValue;

                return this;
            }

            // test if it is a valid CSS selector
            if (trySelector(newValue)) {
                this.options.drop.accept = newValue;

                return this;
            }

            if (newValue === null) {
                delete this.options.drop.accept;

                return this;
            }

            return this.options.drop.accept;
        },

        /*\
         * Interactable.resizable
         [ method ]
         *
         * Gets or sets whether resize actions can be performed on the
         * Interactable
         *
         = (boolean) Indicates if this can be the target of resize elements
         | var isResizeable = interact('input[type=text]').resizable();
         * or
         - options (boolean | object) #optional true/false or An object with event listeners to be fired on resize events (object makes the Interactable resizable)
         = (object) This Interactable
         | interact(element).resizable({
         |     onstart: function (event) {},
         |     onmove : function (event) {},
         |     onend  : function (event) {},
         |
         |     edges: {
         |       top   : true,       // Use pointer coords to check for resize.
         |       left  : false,      // Disable resizing from left edge.
         |       bottom: '.resize-s',// Resize if pointer target matches selector
         |       right : handleEl    // Resize if pointer target is the given Element
         |     },
         |
         |     // Width and height can be adjusted independently. When `true`, width and
         |     // height are adjusted at a 1:1 ratio.
         |     square: false,
         |
         |     // Width and height can be adjusted independently. When `true`, width and
         |     // height maintain the aspect ratio they had when resizing started.
         |     preserveAspectRatio: false,
         |
         |     // a value of 'none' will limit the resize rect to a minimum of 0x0
         |     // 'negate' will allow the rect to have negative width/height
         |     // 'reposition' will keep the width/height positive by swapping
         |     // the top and bottom edges and/or swapping the left and right edges
         |     invert: 'none' || 'negate' || 'reposition'
         |
         |     // limit multiple resizes.
         |     // See the explanation in the @Interactable.draggable example
         |     max: Infinity,
         |     maxPerElement: 1,
         | });
        \*/
        resizable: function (options) {
            if (isObject(options)) {
                this.options.resize.enabled = options.enabled === false? false: true;
                this.setPerAction('resize', options);
                this.setOnEvents('resize', options);

                if (/^x$|^y$|^xy$/.test(options.axis)) {
                    this.options.resize.axis = options.axis;
                }
                else if (options.axis === null) {
                    this.options.resize.axis = defaultOptions.resize.axis;
                }

                if (isBool(options.preserveAspectRatio)) {
                    this.options.resize.preserveAspectRatio = options.preserveAspectRatio;
                }
                else if (isBool(options.square)) {
                    this.options.resize.square = options.square;
                }

                return this;
            }
            if (isBool(options)) {
                this.options.resize.enabled = options;

                return this;
            }
            return this.options.resize;
        },

        /*\
         * Interactable.squareResize
         [ method ]
         *
         * Deprecated. Add a `square: true || false` property to @Interactable.resizable instead
         *
         * Gets or sets whether resizing is forced 1:1 aspect
         *
         = (boolean) Current setting
         *
         * or
         *
         - newValue (boolean) #optional
         = (object) this Interactable
        \*/
        squareResize: function (newValue) {
            if (isBool(newValue)) {
                this.options.resize.square = newValue;

                return this;
            }

            if (newValue === null) {
                delete this.options.resize.square;

                return this;
            }

            return this.options.resize.square;
        },

        /*\
         * Interactable.gesturable
         [ method ]
         *
         * Gets or sets whether multitouch gestures can be performed on the
         * Interactable's element
         *
         = (boolean) Indicates if this can be the target of gesture events
         | var isGestureable = interact(element).gesturable();
         * or
         - options (boolean | object) #optional true/false or An object with event listeners to be fired on gesture events (makes the Interactable gesturable)
         = (object) this Interactable
         | interact(element).gesturable({
         |     onstart: function (event) {},
         |     onmove : function (event) {},
         |     onend  : function (event) {},
         |
         |     // limit multiple gestures.
         |     // See the explanation in @Interactable.draggable example
         |     max: Infinity,
         |     maxPerElement: 1,
         | });
        \*/
        gesturable: function (options) {
            if (isObject(options)) {
                this.options.gesture.enabled = options.enabled === false? false: true;
                this.setPerAction('gesture', options);
                this.setOnEvents('gesture', options);

                return this;
            }

            if (isBool(options)) {
                this.options.gesture.enabled = options;

                return this;
            }

            return this.options.gesture;
        },

        /*\
         * Interactable.autoScroll
         [ method ]
         **
         * Deprecated. Add an `autoscroll` property to the options object
         * passed to @Interactable.draggable or @Interactable.resizable instead.
         *
         * Returns or sets whether dragging and resizing near the edges of the
         * window/container trigger autoScroll for this Interactable
         *
         = (object) Object with autoScroll properties
         *
         * or
         *
         - options (object | boolean) #optional
         * options can be:
         * - an object with margin, distance and interval properties,
         * - true or false to enable or disable autoScroll or
         = (Interactable) this Interactable
        \*/
        autoScroll: function (options) {
            if (isObject(options)) {
                options = extend({ actions: ['drag', 'resize']}, options);
            }
            else if (isBool(options)) {
                options = { actions: ['drag', 'resize'], enabled: options };
            }

            return this.setOptions('autoScroll', options);
        },

        /*\
         * Interactable.snap
         [ method ]
         **
         * Deprecated. Add a `snap` property to the options object passed
         * to @Interactable.draggable or @Interactable.resizable instead.
         *
         * Returns or sets if and how action coordinates are snapped. By
         * default, snapping is relative to the pointer coordinates. You can
         * change this by setting the
         * [`elementOrigin`](https://github.com/taye/interact.js/pull/72).
         **
         = (boolean | object) `false` if snap is disabled; object with snap properties if snap is enabled
         **
         * or
         **
         - options (object | boolean | null) #optional
         = (Interactable) this Interactable
         > Usage
         | interact(document.querySelector('#thing')).snap({
         |     targets: [
         |         // snap to this specific point
         |         {
         |             x: 100,
         |             y: 100,
         |             range: 25
         |         },
         |         // give this function the x and y page coords and snap to the object returned
         |         function (x, y) {
         |             return {
         |                 x: x,
         |                 y: (75 + 50 * Math.sin(x * 0.04)),
         |                 range: 40
         |             };
         |         },
         |         // create a function that snaps to a grid
         |         interact.createSnapGrid({
         |             x: 50,
         |             y: 50,
         |             range: 10,              // optional
         |             offset: { x: 5, y: 10 } // optional
         |         })
         |     ],
         |     // do not snap during normal movement.
         |     // Instead, trigger only one snapped move event
         |     // immediately before the end event.
         |     endOnly: true,
         |
         |     relativePoints: [
         |         { x: 0, y: 0 },  // snap relative to the top left of the element
         |         { x: 1, y: 1 },  // and also to the bottom right
         |     ],  
         |
         |     // offset the snap target coordinates
         |     // can be an object with x/y or 'startCoords'
         |     offset: { x: 50, y: 50 }
         |   }
         | });
        \*/
        snap: function (options) {
            var ret = this.setOptions('snap', options);

            if (ret === this) { return this; }

            return ret.drag;
        },

        setOptions: function (option, options) {
            var actions = options && isArray(options.actions)
                    ? options.actions
                    : ['drag'];

            var i;

            if (isObject(options) || isBool(options)) {
                for (i = 0; i < actions.length; i++) {
                    var action = /resize/.test(actions[i])? 'resize' : actions[i];

                    if (!isObject(this.options[action])) { continue; }

                    var thisOption = this.options[action][option];

                    if (isObject(options)) {
                        extend(thisOption, options);
                        thisOption.enabled = options.enabled === false? false: true;

                        if (option === 'snap') {
                            if (thisOption.mode === 'grid') {
                                thisOption.targets = [
                                    interact.createSnapGrid(extend({
                                        offset: thisOption.gridOffset || { x: 0, y: 0 }
                                    }, thisOption.grid || {}))
                                ];
                            }
                            else if (thisOption.mode === 'anchor') {
                                thisOption.targets = thisOption.anchors;
                            }
                            else if (thisOption.mode === 'path') {
                                thisOption.targets = thisOption.paths;
                            }

                            if ('elementOrigin' in options) {
                                thisOption.relativePoints = [options.elementOrigin];
                            }
                        }
                    }
                    else if (isBool(options)) {
                        thisOption.enabled = options;
                    }
                }

                return this;
            }

            var ret = {},
                allActions = ['drag', 'resize', 'gesture'];

            for (i = 0; i < allActions.length; i++) {
                if (option in defaultOptions[allActions[i]]) {
                    ret[allActions[i]] = this.options[allActions[i]][option];
                }
            }

            return ret;
        },


        /*\
         * Interactable.inertia
         [ method ]
         **
         * Deprecated. Add an `inertia` property to the options object passed
         * to @Interactable.draggable or @Interactable.resizable instead.
         *
         * Returns or sets if and how events continue to run after the pointer is released
         **
         = (boolean | object) `false` if inertia is disabled; `object` with inertia properties if inertia is enabled
         **
         * or
         **
         - options (object | boolean | null) #optional
         = (Interactable) this Interactable
         > Usage
         | // enable and use default settings
         | interact(element).inertia(true);
         |
         | // enable and use custom settings
         | interact(element).inertia({
         |     // value greater than 0
         |     // high values slow the object down more quickly
         |     resistance     : 16,
         |
         |     // the minimum launch speed (pixels per second) that results in inertia start
         |     minSpeed       : 200,
         |
         |     // inertia will stop when the object slows down to this speed
         |     endSpeed       : 20,
         |
         |     // boolean; should actions be resumed when the pointer goes down during inertia
         |     allowResume    : true,
         |
         |     // boolean; should the jump when resuming from inertia be ignored in event.dx/dy
         |     zeroResumeDelta: false,
         |
         |     // if snap/restrict are set to be endOnly and inertia is enabled, releasing
         |     // the pointer without triggering inertia will animate from the release
         |     // point to the snaped/restricted point in the given amount of time (ms)
         |     smoothEndDuration: 300,
         |
         |     // an array of action types that can have inertia (no gesture)
         |     actions        : ['drag', 'resize']
         | });
         |
         | // reset custom settings and use all defaults
         | interact(element).inertia(null);
        \*/
        inertia: function (options) {
            var ret = this.setOptions('inertia', options);

            if (ret === this) { return this; }

            return ret.drag;
        },

        getAction: function (pointer, event, interaction, element) {
            var action = this.defaultActionChecker(pointer, interaction, element);

            if (this.options.actionChecker) {
                return this.options.actionChecker(pointer, event, action, this, element, interaction);
            }

            return action;
        },

        defaultActionChecker: defaultActionChecker,

        /*\
         * Interactable.actionChecker
         [ method ]
         *
         * Gets or sets the function used to check action to be performed on
         * pointerDown
         *
         - checker (function | null) #optional A function which takes a pointer event, defaultAction string, interactable, element and interaction as parameters and returns an object with name property 'drag' 'resize' or 'gesture' and optionally an `edges` object with boolean 'top', 'left', 'bottom' and right props.
         = (Function | Interactable) The checker function or this Interactable
         *
         | interact('.resize-drag')
         |   .resizable(true)
         |   .draggable(true)
         |   .actionChecker(function (pointer, event, action, interactable, element, interaction) {
         |
         |   if (interact.matchesSelector(event.target, '.drag-handle') {
         |     // force drag with handle target
         |     action.name = drag;
         |   }
         |   else {
         |     // resize from the top and right edges
         |     action.name  = 'resize';
         |     action.edges = { top: true, right: true };
         |   }
         |
         |   return action;
         | });
        \*/
        actionChecker: function (checker) {
            if (isFunction(checker)) {
                this.options.actionChecker = checker;

                return this;
            }

            if (checker === null) {
                delete this.options.actionChecker;

                return this;
            }

            return this.options.actionChecker;
        },

        /*\
         * Interactable.getRect
         [ method ]
         *
         * The default function to get an Interactables bounding rect. Can be
         * overridden using @Interactable.rectChecker.
         *
         - element (Element) #optional The element to measure.
         = (object) The object's bounding rectangle.
         o {
         o     top   : 0,
         o     left  : 0,
         o     bottom: 0,
         o     right : 0,
         o     width : 0,
         o     height: 0
         o }
        \*/
        getRect: function rectCheck (element) {
            element = element || this._element;

            if (this.selector && !(isElement(element))) {
                element = this._context.querySelector(this.selector);
            }

            return getElementRect(element);
        },

        /*\
         * Interactable.rectChecker
         [ method ]
         *
         * Returns or sets the function used to calculate the interactable's
         * element's rectangle
         *
         - checker (function) #optional A function which returns this Interactable's bounding rectangle. See @Interactable.getRect
         = (function | object) The checker function or this Interactable
        \*/
        rectChecker: function (checker) {
            if (isFunction(checker)) {
                this.getRect = checker;

                return this;
            }

            if (checker === null) {
                delete this.options.getRect;

                return this;
            }

            return this.getRect;
        },

        /*\
         * Interactable.styleCursor
         [ method ]
         *
         * Returns or sets whether the action that would be performed when the
         * mouse on the element are checked on `mousemove` so that the cursor
         * may be styled appropriately
         *
         - newValue (boolean) #optional
         = (boolean | Interactable) The current setting or this Interactable
        \*/
        styleCursor: function (newValue) {
            if (isBool(newValue)) {
                this.options.styleCursor = newValue;

                return this;
            }

            if (newValue === null) {
                delete this.options.styleCursor;

                return this;
            }

            return this.options.styleCursor;
        },

        /*\
         * Interactable.preventDefault
         [ method ]
         *
         * Returns or sets whether to prevent the browser's default behaviour
         * in response to pointer events. Can be set to:
         *  - `'always'` to always prevent
         *  - `'never'` to never prevent
         *  - `'auto'` to let interact.js try to determine what would be best
         *
         - newValue (string) #optional `true`, `false` or `'auto'`
         = (string | Interactable) The current setting or this Interactable
        \*/
        preventDefault: function (newValue) {
            if (/^(always|never|auto)$/.test(newValue)) {
                this.options.preventDefault = newValue;
                return this;
            }

            if (isBool(newValue)) {
                this.options.preventDefault = newValue? 'always' : 'never';
                return this;
            }

            return this.options.preventDefault;
        },

        /*\
         * Interactable.origin
         [ method ]
         *
         * Gets or sets the origin of the Interactable's element.  The x and y
         * of the origin will be subtracted from action event coordinates.
         *
         - origin (object | string) #optional An object eg. { x: 0, y: 0 } or string 'parent', 'self' or any CSS selector
         * OR
         - origin (Element) #optional An HTML or SVG Element whose rect will be used
         **
         = (object) The current origin or this Interactable
        \*/
        origin: function (newValue) {
            if (trySelector(newValue)) {
                this.options.origin = newValue;
                return this;
            }
            else if (isObject(newValue)) {
                this.options.origin = newValue;
                return this;
            }

            return this.options.origin;
        },

        /*\
         * Interactable.deltaSource
         [ method ]
         *
         * Returns or sets the mouse coordinate types used to calculate the
         * movement of the pointer.
         *
         - newValue (string) #optional Use 'client' if you will be scrolling while interacting; Use 'page' if you want autoScroll to work
         = (string | object) The current deltaSource or this Interactable
        \*/
        deltaSource: function (newValue) {
            if (newValue === 'page' || newValue === 'client') {
                this.options.deltaSource = newValue;

                return this;
            }

            return this.options.deltaSource;
        },

        /*\
         * Interactable.restrict
         [ method ]
         **
         * Deprecated. Add a `restrict` property to the options object passed to
         * @Interactable.draggable, @Interactable.resizable or @Interactable.gesturable instead.
         *
         * Returns or sets the rectangles within which actions on this
         * interactable (after snap calculations) are restricted. By default,
         * restricting is relative to the pointer coordinates. You can change
         * this by setting the
         * [`elementRect`](https://github.com/taye/interact.js/pull/72).
         **
         - options (object) #optional an object with keys drag, resize, and/or gesture whose values are rects, Elements, CSS selectors, or 'parent' or 'self'
         = (object) The current restrictions object or this Interactable
         **
         | interact(element).restrict({
         |     // the rect will be `interact.getElementRect(element.parentNode)`
         |     drag: element.parentNode,
         |
         |     // x and y are relative to the the interactable's origin
         |     resize: { x: 100, y: 100, width: 200, height: 200 }
         | })
         |
         | interact('.draggable').restrict({
         |     // the rect will be the selected element's parent
         |     drag: 'parent',
         |
         |     // do not restrict during normal movement.
         |     // Instead, trigger only one restricted move event
         |     // immediately before the end event.
         |     endOnly: true,
         |
         |     // https://github.com/taye/interact.js/pull/72#issue-41813493
         |     elementRect: { top: 0, left: 0, bottom: 1, right: 1 }
         | });
        \*/
        restrict: function (options) {
            if (!isObject(options)) {
                return this.setOptions('restrict', options);
            }

            var actions = ['drag', 'resize', 'gesture'],
                ret;

            for (var i = 0; i < actions.length; i++) {
                var action = actions[i];

                if (action in options) {
                    var perAction = extend({
                            actions: [action],
                            restriction: options[action]
                        }, options);

                    ret = this.setOptions('restrict', perAction);
                }
            }

            return ret;
        },

        /*\
         * Interactable.context
         [ method ]
         *
         * Gets the selector context Node of the Interactable. The default is `window.document`.
         *
         = (Node) The context Node of this Interactable
         **
        \*/
        context: function () {
            return this._context;
        },

        _context: document,

        /*\
         * Interactable.ignoreFrom
         [ method ]
         *
         * If the target of the `mousedown`, `pointerdown` or `touchstart`
         * event or any of it's parents match the given CSS selector or
         * Element, no drag/resize/gesture is started.
         *
         - newValue (string | Element | null) #optional a CSS selector string, an Element or `null` to not ignore any elements
         = (string | Element | object) The current ignoreFrom value or this Interactable
         **
         | interact(element, { ignoreFrom: document.getElementById('no-action') });
         | // or
         | interact(element).ignoreFrom('input, textarea, a');
        \*/
        ignoreFrom: function (newValue) {
            if (trySelector(newValue)) {            // CSS selector to match event.target
                this.options.ignoreFrom = newValue;
                return this;
            }

            if (isElement(newValue)) {              // specific element
                this.options.ignoreFrom = newValue;
                return this;
            }

            return this.options.ignoreFrom;
        },

        /*\
         * Interactable.allowFrom
         [ method ]
         *
         * A drag/resize/gesture is started only If the target of the
         * `mousedown`, `pointerdown` or `touchstart` event or any of it's
         * parents match the given CSS selector or Element.
         *
         - newValue (string | Element | null) #optional a CSS selector string, an Element or `null` to allow from any element
         = (string | Element | object) The current allowFrom value or this Interactable
         **
         | interact(element, { allowFrom: document.getElementById('drag-handle') });
         | // or
         | interact(element).allowFrom('.handle');
        \*/
        allowFrom: function (newValue) {
            if (trySelector(newValue)) {            // CSS selector to match event.target
                this.options.allowFrom = newValue;
                return this;
            }

            if (isElement(newValue)) {              // specific element
                this.options.allowFrom = newValue;
                return this;
            }

            return this.options.allowFrom;
        },

        /*\
         * Interactable.element
         [ method ]
         *
         * If this is not a selector Interactable, it returns the element this
         * interactable represents
         *
         = (Element) HTML / SVG Element
        \*/
        element: function () {
            return this._element;
        },

        /*\
         * Interactable.fire
         [ method ]
         *
         * Calls listeners for the given InteractEvent type bound globally
         * and directly to this Interactable
         *
         - iEvent (InteractEvent) The InteractEvent object to be fired on this Interactable
         = (Interactable) this Interactable
        \*/
        fire: function (iEvent) {
            if (!(iEvent && iEvent.type) || !contains(eventTypes, iEvent.type)) {
                return this;
            }

            var listeners,
                i,
                len,
                onEvent = 'on' + iEvent.type,
                funcName = '';

            // Interactable#on() listeners
            if (iEvent.type in this._iEvents) {
                listeners = this._iEvents[iEvent.type];

                for (i = 0, len = listeners.length; i < len && !iEvent.immediatePropagationStopped; i++) {
                    funcName = listeners[i].name;
                    listeners[i](iEvent);
                }
            }

            // interactable.onevent listener
            if (isFunction(this[onEvent])) {
                funcName = this[onEvent].name;
                this[onEvent](iEvent);
            }

            // interact.on() listeners
            if (iEvent.type in globalEvents && (listeners = globalEvents[iEvent.type]))  {

                for (i = 0, len = listeners.length; i < len && !iEvent.immediatePropagationStopped; i++) {
                    funcName = listeners[i].name;
                    listeners[i](iEvent);
                }
            }

            return this;
        },

        /*\
         * Interactable.on
         [ method ]
         *
         * Binds a listener for an InteractEvent or DOM event.
         *
         - eventType  (string | array | object) The types of events to listen for
         - listener   (function) The function to be called on the given event(s)
         - useCapture (boolean) #optional useCapture flag for addEventListener
         = (object) This Interactable
        \*/
        on: function (eventType, listener, useCapture) {
            var i;

            if (isString(eventType) && eventType.search(' ') !== -1) {
                eventType = eventType.trim().split(/ +/);
            }

            if (isArray(eventType)) {
                for (i = 0; i < eventType.length; i++) {
                    this.on(eventType[i], listener, useCapture);
                }

                return this;
            }

            if (isObject(eventType)) {
                for (var prop in eventType) {
                    this.on(prop, eventType[prop], listener);
                }

                return this;
            }

            if (eventType === 'wheel') {
                eventType = wheelEvent;
            }

            // convert to boolean
            useCapture = useCapture? true: false;

            if (contains(eventTypes, eventType)) {
                // if this type of event was never bound to this Interactable
                if (!(eventType in this._iEvents)) {
                    this._iEvents[eventType] = [listener];
                }
                else {
                    this._iEvents[eventType].push(listener);
                }
            }
            // delegated event for selector
            else if (this.selector) {
                if (!delegatedEvents[eventType]) {
                    delegatedEvents[eventType] = {
                        selectors: [],
                        contexts : [],
                        listeners: []
                    };

                    // add delegate listener functions
                    for (i = 0; i < documents.length; i++) {
                        events.add(documents[i], eventType, delegateListener);
                        events.add(documents[i], eventType, delegateUseCapture, true);
                    }
                }

                var delegated = delegatedEvents[eventType],
                    index;

                for (index = delegated.selectors.length - 1; index >= 0; index--) {
                    if (delegated.selectors[index] === this.selector
                        && delegated.contexts[index] === this._context) {
                        break;
                    }
                }

                if (index === -1) {
                    index = delegated.selectors.length;

                    delegated.selectors.push(this.selector);
                    delegated.contexts .push(this._context);
                    delegated.listeners.push([]);
                }

                // keep listener and useCapture flag
                delegated.listeners[index].push([listener, useCapture]);
            }
            else {
                events.add(this._element, eventType, listener, useCapture);
            }

            return this;
        },

        /*\
         * Interactable.off
         [ method ]
         *
         * Removes an InteractEvent or DOM event listener
         *
         - eventType  (string | array | object) The types of events that were listened for
         - listener   (function) The listener function to be removed
         - useCapture (boolean) #optional useCapture flag for removeEventListener
         = (object) This Interactable
        \*/
        off: function (eventType, listener, useCapture) {
            var i;

            if (isString(eventType) && eventType.search(' ') !== -1) {
                eventType = eventType.trim().split(/ +/);
            }

            if (isArray(eventType)) {
                for (i = 0; i < eventType.length; i++) {
                    this.off(eventType[i], listener, useCapture);
                }

                return this;
            }

            if (isObject(eventType)) {
                for (var prop in eventType) {
                    this.off(prop, eventType[prop], listener);
                }

                return this;
            }

            var eventList,
                index = -1;

            // convert to boolean
            useCapture = useCapture? true: false;

            if (eventType === 'wheel') {
                eventType = wheelEvent;
            }

            // if it is an action event type
            if (contains(eventTypes, eventType)) {
                eventList = this._iEvents[eventType];

                if (eventList && (index = indexOf(eventList, listener)) !== -1) {
                    this._iEvents[eventType].splice(index, 1);
                }
            }
            // delegated event
            else if (this.selector) {
                var delegated = delegatedEvents[eventType],
                    matchFound = false;

                if (!delegated) { return this; }

                // count from last index of delegated to 0
                for (index = delegated.selectors.length - 1; index >= 0; index--) {
                    // look for matching selector and context Node
                    if (delegated.selectors[index] === this.selector
                        && delegated.contexts[index] === this._context) {

                        var listeners = delegated.listeners[index];

                        // each item of the listeners array is an array: [function, useCaptureFlag]
                        for (i = listeners.length - 1; i >= 0; i--) {
                            var fn = listeners[i][0],
                                useCap = listeners[i][1];

                            // check if the listener functions and useCapture flags match
                            if (fn === listener && useCap === useCapture) {
                                // remove the listener from the array of listeners
                                listeners.splice(i, 1);

                                // if all listeners for this interactable have been removed
                                // remove the interactable from the delegated arrays
                                if (!listeners.length) {
                                    delegated.selectors.splice(index, 1);
                                    delegated.contexts .splice(index, 1);
                                    delegated.listeners.splice(index, 1);

                                    // remove delegate function from context
                                    events.remove(this._context, eventType, delegateListener);
                                    events.remove(this._context, eventType, delegateUseCapture, true);

                                    // remove the arrays if they are empty
                                    if (!delegated.selectors.length) {
                                        delegatedEvents[eventType] = null;
                                    }
                                }

                                // only remove one listener
                                matchFound = true;
                                break;
                            }
                        }

                        if (matchFound) { break; }
                    }
                }
            }
            // remove listener from this Interatable's element
            else {
                events.remove(this._element, eventType, listener, useCapture);
            }

            return this;
        },

        /*\
         * Interactable.set
         [ method ]
         *
         * Reset the options of this Interactable
         - options (object) The new settings to apply
         = (object) This Interactable
        \*/
        set: function (options) {
            if (!isObject(options)) {
                options = {};
            }

            this.options = extend({}, defaultOptions.base);

            var i,
                actions = ['drag', 'drop', 'resize', 'gesture'],
                methods = ['draggable', 'dropzone', 'resizable', 'gesturable'],
                perActions = extend(extend({}, defaultOptions.perAction), options[action] || {});

            for (i = 0; i < actions.length; i++) {
                var action = actions[i];

                this.options[action] = extend({}, defaultOptions[action]);

                this.setPerAction(action, perActions);

                this[methods[i]](options[action]);
            }

            var settings = [
                    'accept', 'actionChecker', 'allowFrom', 'deltaSource',
                    'dropChecker', 'ignoreFrom', 'origin', 'preventDefault',
                    'rectChecker', 'styleCursor'
                ];

            for (i = 0, len = settings.length; i < len; i++) {
                var setting = settings[i];

                this.options[setting] = defaultOptions.base[setting];

                if (setting in options) {
                    this[setting](options[setting]);
                }
            }

            return this;
        },

        /*\
         * Interactable.unset
         [ method ]
         *
         * Remove this interactable from the list of interactables and remove
         * it's drag, drop, resize and gesture capabilities
         *
         = (object) @interact
        \*/
        unset: function () {
            events.remove(this._element, 'all');

            if (!isString(this.selector)) {
                events.remove(this, 'all');
                if (this.options.styleCursor) {
                    this._element.style.cursor = '';
                }
            }
            else {
                // remove delegated events
                for (var type in delegatedEvents) {
                    var delegated = delegatedEvents[type];

                    for (var i = 0; i < delegated.selectors.length; i++) {
                        if (delegated.selectors[i] === this.selector
                            && delegated.contexts[i] === this._context) {

                            delegated.selectors.splice(i, 1);
                            delegated.contexts .splice(i, 1);
                            delegated.listeners.splice(i, 1);

                            // remove the arrays if they are empty
                            if (!delegated.selectors.length) {
                                delegatedEvents[type] = null;
                            }
                        }

                        events.remove(this._context, type, delegateListener);
                        events.remove(this._context, type, delegateUseCapture, true);

                        break;
                    }
                }
            }

            this.dropzone(false);

            interactables.splice(indexOf(interactables, this), 1);

            return interact;
        }
    };

    function warnOnce (method, message) {
        var warned = false;

        return function () {
            if (!warned) {
                window.console.warn(message);
                warned = true;
            }

            return method.apply(this, arguments);
        };
    }

    Interactable.prototype.snap = warnOnce(Interactable.prototype.snap,
         'Interactable#snap is deprecated. See the new documentation for snapping at http://interactjs.io/docs/snapping');
    Interactable.prototype.restrict = warnOnce(Interactable.prototype.restrict,
         'Interactable#restrict is deprecated. See the new documentation for resticting at http://interactjs.io/docs/restriction');
    Interactable.prototype.inertia = warnOnce(Interactable.prototype.inertia,
         'Interactable#inertia is deprecated. See the new documentation for inertia at http://interactjs.io/docs/inertia');
    Interactable.prototype.autoScroll = warnOnce(Interactable.prototype.autoScroll,
         'Interactable#autoScroll is deprecated. See the new documentation for autoScroll at http://interactjs.io/docs/#autoscroll');
    Interactable.prototype.squareResize = warnOnce(Interactable.prototype.squareResize,
         'Interactable#squareResize is deprecated. See http://interactjs.io/docs/#resize-square');

    Interactable.prototype.accept = warnOnce(Interactable.prototype.accept,
         'Interactable#accept is deprecated. use Interactable#dropzone({ accept: target }) instead');
    Interactable.prototype.dropChecker = warnOnce(Interactable.prototype.dropChecker,
         'Interactable#dropChecker is deprecated. use Interactable#dropzone({ dropChecker: checkerFunction }) instead');
    Interactable.prototype.context = warnOnce(Interactable.prototype.context,
         'Interactable#context as a method is deprecated. It will soon be a DOM Node instead');

    /*\
     * interact.isSet
     [ method ]
     *
     * Check if an element has been set
     - element (Element) The Element being searched for
     = (boolean) Indicates if the element or CSS selector was previously passed to interact
    \*/
    interact.isSet = function(element, options) {
        return interactables.indexOfElement(element, options && options.context) !== -1;
    };

    /*\
     * interact.on
     [ method ]
     *
     * Adds a global listener for an InteractEvent or adds a DOM event to
     * `document`
     *
     - type       (string | array | object) The types of events to listen for
     - listener   (function) The function to be called on the given event(s)
     - useCapture (boolean) #optional useCapture flag for addEventListener
     = (object) interact
    \*/
    interact.on = function (type, listener, useCapture) {
        if (isString(type) && type.search(' ') !== -1) {
            type = type.trim().split(/ +/);
        }

        if (isArray(type)) {
            for (var i = 0; i < type.length; i++) {
                interact.on(type[i], listener, useCapture);
            }

            return interact;
        }

        if (isObject(type)) {
            for (var prop in type) {
                interact.on(prop, type[prop], listener);
            }

            return interact;
        }

        // if it is an InteractEvent type, add listener to globalEvents
        if (contains(eventTypes, type)) {
            // if this type of event was never bound
            if (!globalEvents[type]) {
                globalEvents[type] = [listener];
            }
            else {
                globalEvents[type].push(listener);
            }
        }
        // If non InteractEvent type, addEventListener to document
        else {
            events.add(document, type, listener, useCapture);
        }

        return interact;
    };

    /*\
     * interact.off
     [ method ]
     *
     * Removes a global InteractEvent listener or DOM event from `document`
     *
     - type       (string | array | object) The types of events that were listened for
     - listener   (function) The listener function to be removed
     - useCapture (boolean) #optional useCapture flag for removeEventListener
     = (object) interact
     \*/
    interact.off = function (type, listener, useCapture) {
        if (isString(type) && type.search(' ') !== -1) {
            type = type.trim().split(/ +/);
        }

        if (isArray(type)) {
            for (var i = 0; i < type.length; i++) {
                interact.off(type[i], listener, useCapture);
            }

            return interact;
        }

        if (isObject(type)) {
            for (var prop in type) {
                interact.off(prop, type[prop], listener);
            }

            return interact;
        }

        if (!contains(eventTypes, type)) {
            events.remove(document, type, listener, useCapture);
        }
        else {
            var index;

            if (type in globalEvents
                && (index = indexOf(globalEvents[type], listener)) !== -1) {
                globalEvents[type].splice(index, 1);
            }
        }

        return interact;
    };

    /*\
     * interact.enableDragging
     [ method ]
     *
     * Deprecated.
     *
     * Returns or sets whether dragging is enabled for any Interactables
     *
     - newValue (boolean) #optional `true` to allow the action; `false` to disable action for all Interactables
     = (boolean | object) The current setting or interact
    \*/
    interact.enableDragging = warnOnce(function (newValue) {
        if (newValue !== null && newValue !== undefined) {
            actionIsEnabled.drag = newValue;

            return interact;
        }
        return actionIsEnabled.drag;
    }, 'interact.enableDragging is deprecated and will soon be removed.');

    /*\
     * interact.enableResizing
     [ method ]
     *
     * Deprecated.
     *
     * Returns or sets whether resizing is enabled for any Interactables
     *
     - newValue (boolean) #optional `true` to allow the action; `false` to disable action for all Interactables
     = (boolean | object) The current setting or interact
    \*/
    interact.enableResizing = warnOnce(function (newValue) {
        if (newValue !== null && newValue !== undefined) {
            actionIsEnabled.resize = newValue;

            return interact;
        }
        return actionIsEnabled.resize;
    }, 'interact.enableResizing is deprecated and will soon be removed.');

    /*\
     * interact.enableGesturing
     [ method ]
     *
     * Deprecated.
     *
     * Returns or sets whether gesturing is enabled for any Interactables
     *
     - newValue (boolean) #optional `true` to allow the action; `false` to disable action for all Interactables
     = (boolean | object) The current setting or interact
    \*/
    interact.enableGesturing = warnOnce(function (newValue) {
        if (newValue !== null && newValue !== undefined) {
            actionIsEnabled.gesture = newValue;

            return interact;
        }
        return actionIsEnabled.gesture;
    }, 'interact.enableGesturing is deprecated and will soon be removed.');

    interact.eventTypes = eventTypes;

    /*\
     * interact.debug
     [ method ]
     *
     * Returns debugging data
     = (object) An object with properties that outline the current state and expose internal functions and variables
    \*/
    interact.debug = function () {
        var interaction = interactions[0] || new Interaction();

        return {
            interactions          : interactions,
            target                : interaction.target,
            dragging              : interaction.dragging,
            resizing              : interaction.resizing,
            gesturing             : interaction.gesturing,
            prepared              : interaction.prepared,
            matches               : interaction.matches,
            matchElements         : interaction.matchElements,

            prevCoords            : interaction.prevCoords,
            startCoords           : interaction.startCoords,

            pointerIds            : interaction.pointerIds,
            pointers              : interaction.pointers,
            addPointer            : listeners.addPointer,
            removePointer         : listeners.removePointer,
            recordPointer        : listeners.recordPointer,

            snap                  : interaction.snapStatus,
            restrict              : interaction.restrictStatus,
            inertia               : interaction.inertiaStatus,

            downTime              : interaction.downTimes[0],
            downEvent             : interaction.downEvent,
            downPointer           : interaction.downPointer,
            prevEvent             : interaction.prevEvent,

            Interactable          : Interactable,
            interactables         : interactables,
            pointerIsDown         : interaction.pointerIsDown,
            defaultOptions        : defaultOptions,
            defaultActionChecker  : defaultActionChecker,

            actionCursors         : actionCursors,
            dragMove              : listeners.dragMove,
            resizeMove            : listeners.resizeMove,
            gestureMove           : listeners.gestureMove,
            pointerUp             : listeners.pointerUp,
            pointerDown           : listeners.pointerDown,
            pointerMove           : listeners.pointerMove,
            pointerHover          : listeners.pointerHover,

            eventTypes            : eventTypes,

            events                : events,
            globalEvents          : globalEvents,
            delegatedEvents       : delegatedEvents,

            prefixedPropREs       : prefixedPropREs
        };
    };

    // expose the functions used to calculate multi-touch properties
    interact.getPointerAverage = pointerAverage;
    interact.getTouchBBox     = touchBBox;
    interact.getTouchDistance = touchDistance;
    interact.getTouchAngle    = touchAngle;

    interact.getElementRect         = getElementRect;
    interact.getElementClientRect   = getElementClientRect;
    interact.matchesSelector        = matchesSelector;
    interact.closest                = closest;

    /*\
     * interact.margin
     [ method ]
     *
     * Deprecated. Use `interact(target).resizable({ margin: number });` instead.
     * Returns or sets the margin for autocheck resizing used in
     * @Interactable.getAction. That is the distance from the bottom and right
     * edges of an element clicking in which will start resizing
     *
     - newValue (number) #optional
     = (number | interact) The current margin value or interact
    \*/
    interact.margin = warnOnce(function (newvalue) {
        if (isNumber(newvalue)) {
            margin = newvalue;

            return interact;
        }
        return margin;
    },
    'interact.margin is deprecated. Use interact(target).resizable({ margin: number }); instead.') ;

    /*\
     * interact.supportsTouch
     [ method ]
     *
     = (boolean) Whether or not the browser supports touch input
    \*/
    interact.supportsTouch = function () {
        return supportsTouch;
    };

    /*\
     * interact.supportsPointerEvent
     [ method ]
     *
     = (boolean) Whether or not the browser supports PointerEvents
    \*/
    interact.supportsPointerEvent = function () {
        return supportsPointerEvent;
    };

    /*\
     * interact.stop
     [ method ]
     *
     * Cancels all interactions (end events are not fired)
     *
     - event (Event) An event on which to call preventDefault()
     = (object) interact
    \*/
    interact.stop = function (event) {
        for (var i = interactions.length - 1; i >= 0; i--) {
            interactions[i].stop(event);
        }

        return interact;
    };

    /*\
     * interact.dynamicDrop
     [ method ]
     *
     * Returns or sets whether the dimensions of dropzone elements are
     * calculated on every dragmove or only on dragstart for the default
     * dropChecker
     *
     - newValue (boolean) #optional True to check on each move. False to check only before start
     = (boolean | interact) The current setting or interact
    \*/
    interact.dynamicDrop = function (newValue) {
        if (isBool(newValue)) {
            //if (dragging && dynamicDrop !== newValue && !newValue) {
                //calcRects(dropzones);
            //}

            dynamicDrop = newValue;

            return interact;
        }
        return dynamicDrop;
    };

    /*\
     * interact.pointerMoveTolerance
     [ method ]
     * Returns or sets the distance the pointer must be moved before an action
     * sequence occurs. This also affects tolerance for tap events.
     *
     - newValue (number) #optional The movement from the start position must be greater than this value
     = (number | Interactable) The current setting or interact
    \*/
    interact.pointerMoveTolerance = function (newValue) {
        if (isNumber(newValue)) {
            pointerMoveTolerance = newValue;

            return this;
        }

        return pointerMoveTolerance;
    };

    /*\
     * interact.maxInteractions
     [ method ]
     **
     * Returns or sets the maximum number of concurrent interactions allowed.
     * By default only 1 interaction is allowed at a time (for backwards
     * compatibility). To allow multiple interactions on the same Interactables
     * and elements, you need to enable it in the draggable, resizable and
     * gesturable `'max'` and `'maxPerElement'` options.
     **
     - newValue (number) #optional Any number. newValue <= 0 means no interactions.
    \*/
    interact.maxInteractions = function (newValue) {
        if (isNumber(newValue)) {
            maxInteractions = newValue;

            return this;
        }

        return maxInteractions;
    };

    interact.createSnapGrid = function (grid) {
        return function (x, y) {
            var offsetX = 0,
                offsetY = 0;

            if (isObject(grid.offset)) {
                offsetX = grid.offset.x;
                offsetY = grid.offset.y;
            }

            var gridx = Math.round((x - offsetX) / grid.x),
                gridy = Math.round((y - offsetY) / grid.y),

                newX = gridx * grid.x + offsetX,
                newY = gridy * grid.y + offsetY;

            return {
                x: newX,
                y: newY,
                range: grid.range
            };
        };
    };

    function endAllInteractions (event) {
        for (var i = 0; i < interactions.length; i++) {
            interactions[i].pointerEnd(event, event);
        }
    }

    function listenToDocument (doc) {
        if (contains(documents, doc)) { return; }

        var win = doc.defaultView || doc.parentWindow;

        // add delegate event listener
        for (var eventType in delegatedEvents) {
            events.add(doc, eventType, delegateListener);
            events.add(doc, eventType, delegateUseCapture, true);
        }

        if (PointerEvent) {
            if (PointerEvent === win.MSPointerEvent) {
                pEventTypes = {
                    up: 'MSPointerUp', down: 'MSPointerDown', over: 'mouseover',
                    out: 'mouseout', move: 'MSPointerMove', cancel: 'MSPointerCancel' };
            }
            else {
                pEventTypes = {
                    up: 'pointerup', down: 'pointerdown', over: 'pointerover',
                    out: 'pointerout', move: 'pointermove', cancel: 'pointercancel' };
            }

            events.add(doc, pEventTypes.down  , listeners.selectorDown );
            events.add(doc, pEventTypes.move  , listeners.pointerMove  );
            events.add(doc, pEventTypes.over  , listeners.pointerOver  );
            events.add(doc, pEventTypes.out   , listeners.pointerOut   );
            events.add(doc, pEventTypes.up    , listeners.pointerUp    );
            events.add(doc, pEventTypes.cancel, listeners.pointerCancel);

            // autoscroll
            events.add(doc, pEventTypes.move, listeners.autoScrollMove);
        }
        else {
            events.add(doc, 'mousedown', listeners.selectorDown);
            events.add(doc, 'mousemove', listeners.pointerMove );
            events.add(doc, 'mouseup'  , listeners.pointerUp   );
            events.add(doc, 'mouseover', listeners.pointerOver );
            events.add(doc, 'mouseout' , listeners.pointerOut  );

            events.add(doc, 'touchstart' , listeners.selectorDown );
            events.add(doc, 'touchmove'  , listeners.pointerMove  );
            events.add(doc, 'touchend'   , listeners.pointerUp    );
            events.add(doc, 'touchcancel', listeners.pointerCancel);

            // autoscroll
            events.add(doc, 'mousemove', listeners.autoScrollMove);
            events.add(doc, 'touchmove', listeners.autoScrollMove);
        }

        events.add(win, 'blur', endAllInteractions);

        try {
            if (win.frameElement) {
                var parentDoc = win.frameElement.ownerDocument,
                    parentWindow = parentDoc.defaultView;

                events.add(parentDoc   , 'mouseup'      , listeners.pointerEnd);
                events.add(parentDoc   , 'touchend'     , listeners.pointerEnd);
                events.add(parentDoc   , 'touchcancel'  , listeners.pointerEnd);
                events.add(parentDoc   , 'pointerup'    , listeners.pointerEnd);
                events.add(parentDoc   , 'MSPointerUp'  , listeners.pointerEnd);
                events.add(parentWindow, 'blur'         , endAllInteractions );
            }
        }
        catch (error) {
            interact.windowParentError = error;
        }

        // prevent native HTML5 drag on interact.js target elements
        events.add(doc, 'dragstart', function (event) {
            for (var i = 0; i < interactions.length; i++) {
                var interaction = interactions[i];

                if (interaction.element
                    && (interaction.element === event.target
                        || nodeContains(interaction.element, event.target))) {

                    interaction.checkAndPreventDefault(event, interaction.target, interaction.element);
                    return;
                }
            }
        });

        if (events.useAttachEvent) {
            // For IE's lack of Event#preventDefault
            events.add(doc, 'selectstart', function (event) {
                var interaction = interactions[0];

                if (interaction.currentAction()) {
                    interaction.checkAndPreventDefault(event);
                }
            });

            // For IE's bad dblclick event sequence
            events.add(doc, 'dblclick', doOnInteractions('ie8Dblclick'));
        }

        documents.push(doc);
    }

    listenToDocument(document);

    function indexOf (array, target) {
        for (var i = 0, len = array.length; i < len; i++) {
            if (array[i] === target) {
                return i;
            }
        }

        return -1;
    }

    function contains (array, target) {
        return indexOf(array, target) !== -1;
    }

    function matchesSelector (element, selector, nodeList) {
        if (ie8MatchesSelector) {
            return ie8MatchesSelector(element, selector, nodeList);
        }

        // remove /deep/ from selectors if shadowDOM polyfill is used
        if (window !== realWindow) {
            selector = selector.replace(/\/deep\//g, ' ');
        }

        return element[prefixedMatchesSelector](selector);
    }

    function matchesUpTo (element, selector, limit) {
        while (isElement(element)) {
            if (matchesSelector(element, selector)) {
                return true;
            }

            element = parentElement(element);

            if (element === limit) {
                return matchesSelector(element, selector);
            }
        }

        return false;
    }

    // For IE8's lack of an Element#matchesSelector
    // taken from http://tanalin.com/en/blog/2012/12/matches-selector-ie8/ and modified
    if (!(prefixedMatchesSelector in Element.prototype) || !isFunction(Element.prototype[prefixedMatchesSelector])) {
        ie8MatchesSelector = function (element, selector, elems) {
            elems = elems || element.parentNode.querySelectorAll(selector);

            for (var i = 0, len = elems.length; i < len; i++) {
                if (elems[i] === element) {
                    return true;
                }
            }

            return false;
        };
    }

    // requestAnimationFrame polyfill
    (function() {
        var lastTime = 0,
            vendors = ['ms', 'moz', 'webkit', 'o'];

        for(var x = 0; x < vendors.length && !realWindow.requestAnimationFrame; ++x) {
            reqFrame = realWindow[vendors[x]+'RequestAnimationFrame'];
            cancelFrame = realWindow[vendors[x]+'CancelAnimationFrame'] || realWindow[vendors[x]+'CancelRequestAnimationFrame'];
        }

        if (!reqFrame) {
            reqFrame = function(callback) {
                var currTime = new Date().getTime(),
                    timeToCall = Math.max(0, 16 - (currTime - lastTime)),
                    id = setTimeout(function() { callback(currTime + timeToCall); },
                  timeToCall);
                lastTime = currTime + timeToCall;
                return id;
            };
        }

        if (!cancelFrame) {
            cancelFrame = function(id) {
                clearTimeout(id);
            };
        }
    }());

    /* global exports: true, module, define */

    // http://documentcloud.github.io/underscore/docs/underscore.html#section-11
    if (typeof exports !== 'undefined') {
        if (typeof module !== 'undefined' && module.exports) {
            exports = module.exports = interact;
        }
        exports.interact = interact;
    }
    // AMD
    else if (typeof define === 'function' && define.amd) {
        define('interact', function() {
            return interact;
        });
    }
    else {
        realWindow.interact = interact;
    }

} (typeof window === 'undefined'? undefined : window));

},{}],2:[function(require,module,exports){
var isObject = require('./isObject'),
    now = require('./now'),
    toNumber = require('./toNumber');

/** Used as the `TypeError` message for "Functions" methods. */
var FUNC_ERROR_TEXT = 'Expected a function';

/* Built-in method references for those with the same name as other `lodash` methods. */
var nativeMax = Math.max;

/**
 * Creates a debounced function that delays invoking `func` until after `wait`
 * milliseconds have elapsed since the last time the debounced function was
 * invoked. The debounced function comes with a `cancel` method to cancel
 * delayed `func` invocations and a `flush` method to immediately invoke them.
 * Provide an options object to indicate whether `func` should be invoked on
 * the leading and/or trailing edge of the `wait` timeout. The `func` is invoked
 * with the last arguments provided to the debounced function. Subsequent calls
 * to the debounced function return the result of the last `func` invocation.
 *
 * **Note:** If `leading` and `trailing` options are `true`, `func` is invoked
 * on the trailing edge of the timeout only if the debounced function is
 * invoked more than once during the `wait` timeout.
 *
 * See [David Corbacho's article](http://drupalmotion.com/article/debounce-and-throttle-visual-explanation)
 * for details over the differences between `_.debounce` and `_.throttle`.
 *
 * @static
 * @memberOf _
 * @category Function
 * @param {Function} func The function to debounce.
 * @param {number} [wait=0] The number of milliseconds to delay.
 * @param {Object} [options] The options object.
 * @param {boolean} [options.leading=false] Specify invoking on the leading
 *  edge of the timeout.
 * @param {number} [options.maxWait] The maximum time `func` is allowed to be
 *  delayed before it's invoked.
 * @param {boolean} [options.trailing=true] Specify invoking on the trailing
 *  edge of the timeout.
 * @returns {Function} Returns the new debounced function.
 * @example
 *
 * // Avoid costly calculations while the window size is in flux.
 * jQuery(window).on('resize', _.debounce(calculateLayout, 150));
 *
 * // Invoke `sendMail` when clicked, debouncing subsequent calls.
 * jQuery(element).on('click', _.debounce(sendMail, 300, {
 *   'leading': true,
 *   'trailing': false
 * }));
 *
 * // Ensure `batchLog` is invoked once after 1 second of debounced calls.
 * var debounced = _.debounce(batchLog, 250, { 'maxWait': 1000 });
 * var source = new EventSource('/stream');
 * jQuery(source).on('message', debounced);
 *
 * // Cancel the trailing debounced invocation.
 * jQuery(window).on('popstate', debounced.cancel);
 */
function debounce(func, wait, options) {
  var args,
      maxTimeoutId,
      result,
      stamp,
      thisArg,
      timeoutId,
      trailingCall,
      lastCalled = 0,
      leading = false,
      maxWait = false,
      trailing = true;

  if (typeof func != 'function') {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  wait = toNumber(wait) || 0;
  if (isObject(options)) {
    leading = !!options.leading;
    maxWait = 'maxWait' in options && nativeMax(toNumber(options.maxWait) || 0, wait);
    trailing = 'trailing' in options ? !!options.trailing : trailing;
  }

  function cancel() {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (maxTimeoutId) {
      clearTimeout(maxTimeoutId);
    }
    lastCalled = 0;
    args = maxTimeoutId = thisArg = timeoutId = trailingCall = undefined;
  }

  function complete(isCalled, id) {
    if (id) {
      clearTimeout(id);
    }
    maxTimeoutId = timeoutId = trailingCall = undefined;
    if (isCalled) {
      lastCalled = now();
      result = func.apply(thisArg, args);
      if (!timeoutId && !maxTimeoutId) {
        args = thisArg = undefined;
      }
    }
  }

  function delayed() {
    var remaining = wait - (now() - stamp);
    if (remaining <= 0 || remaining > wait) {
      complete(trailingCall, maxTimeoutId);
    } else {
      timeoutId = setTimeout(delayed, remaining);
    }
  }

  function flush() {
    if ((timeoutId && trailingCall) || (maxTimeoutId && trailing)) {
      result = func.apply(thisArg, args);
    }
    cancel();
    return result;
  }

  function maxDelayed() {
    complete(trailing, timeoutId);
  }

  function debounced() {
    args = arguments;
    stamp = now();
    thisArg = this;
    trailingCall = trailing && (timeoutId || !leading);

    if (maxWait === false) {
      var leadingCall = leading && !timeoutId;
    } else {
      if (!lastCalled && !maxTimeoutId && !leading) {
        lastCalled = stamp;
      }
      var remaining = maxWait - (stamp - lastCalled);

      var isCalled = (remaining <= 0 || remaining > maxWait) &&
        (leading || maxTimeoutId);

      if (isCalled) {
        if (maxTimeoutId) {
          maxTimeoutId = clearTimeout(maxTimeoutId);
        }
        lastCalled = stamp;
        result = func.apply(thisArg, args);
      }
      else if (!maxTimeoutId) {
        maxTimeoutId = setTimeout(maxDelayed, remaining);
      }
    }
    if (isCalled && timeoutId) {
      timeoutId = clearTimeout(timeoutId);
    }
    else if (!timeoutId && wait !== maxWait) {
      timeoutId = setTimeout(delayed, wait);
    }
    if (leadingCall) {
      isCalled = true;
      result = func.apply(thisArg, args);
    }
    if (isCalled && !timeoutId && !maxTimeoutId) {
      args = thisArg = undefined;
    }
    return result;
  }
  debounced.cancel = cancel;
  debounced.flush = flush;
  return debounced;
}

module.exports = debounce;

},{"./isObject":4,"./now":5,"./toNumber":7}],3:[function(require,module,exports){
var isObject = require('./isObject');

/** `Object#toString` result references. */
var funcTag = '[object Function]',
    genTag = '[object GeneratorFunction]';

/** Used for built-in method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString = objectProto.toString;

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction(value) {
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in Safari 8 which returns 'object' for typed array constructors, and
  // PhantomJS 1.9 which returns 'function' for `NodeList` instances.
  var tag = isObject(value) ? objectToString.call(value) : '';
  return tag == funcTag || tag == genTag;
}

module.exports = isFunction;

},{"./isObject":4}],4:[function(require,module,exports){
/**
 * Checks if `value` is the [language type](https://es5.github.io/#x8) of `Object`.
 * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(_.noop);
 * // => true
 *
 * _.isObject(null);
 * // => false
 */
function isObject(value) {
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

module.exports = isObject;

},{}],5:[function(require,module,exports){
/**
 * Gets the timestamp of the number of milliseconds that have elapsed since
 * the Unix epoch (1 January 1970 00:00:00 UTC).
 *
 * @static
 * @memberOf _
 * @type {Function}
 * @category Date
 * @returns {number} Returns the timestamp.
 * @example
 *
 * _.defer(function(stamp) {
 *   console.log(_.now() - stamp);
 * }, _.now());
 * // => logs the number of milliseconds it took for the deferred function to be invoked
 */
var now = Date.now;

module.exports = now;

},{}],6:[function(require,module,exports){
var debounce = require('./debounce'),
    isObject = require('./isObject');

/** Used as the `TypeError` message for "Functions" methods. */
var FUNC_ERROR_TEXT = 'Expected a function';

/**
 * Creates a throttled function that only invokes `func` at most once per
 * every `wait` milliseconds. The throttled function comes with a `cancel`
 * method to cancel delayed `func` invocations and a `flush` method to
 * immediately invoke them. Provide an options object to indicate whether
 * `func` should be invoked on the leading and/or trailing edge of the `wait`
 * timeout. The `func` is invoked with the last arguments provided to the
 * throttled function. Subsequent calls to the throttled function return the
 * result of the last `func` invocation.
 *
 * **Note:** If `leading` and `trailing` options are `true`, `func` is invoked
 * on the trailing edge of the timeout only if the throttled function is
 * invoked more than once during the `wait` timeout.
 *
 * See [David Corbacho's article](http://drupalmotion.com/article/debounce-and-throttle-visual-explanation)
 * for details over the differences between `_.throttle` and `_.debounce`.
 *
 * @static
 * @memberOf _
 * @category Function
 * @param {Function} func The function to throttle.
 * @param {number} [wait=0] The number of milliseconds to throttle invocations to.
 * @param {Object} [options] The options object.
 * @param {boolean} [options.leading=true] Specify invoking on the leading
 *  edge of the timeout.
 * @param {boolean} [options.trailing=true] Specify invoking on the trailing
 *  edge of the timeout.
 * @returns {Function} Returns the new throttled function.
 * @example
 *
 * // Avoid excessively updating the position while scrolling.
 * jQuery(window).on('scroll', _.throttle(updatePosition, 100));
 *
 * // Invoke `renewToken` when the click event is fired, but not more than once every 5 minutes.
 * var throttled = _.throttle(renewToken, 300000, { 'trailing': false });
 * jQuery(element).on('click', throttled);
 *
 * // Cancel the trailing throttled invocation.
 * jQuery(window).on('popstate', throttled.cancel);
 */
function throttle(func, wait, options) {
  var leading = true,
      trailing = true;

  if (typeof func != 'function') {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  if (isObject(options)) {
    leading = 'leading' in options ? !!options.leading : leading;
    trailing = 'trailing' in options ? !!options.trailing : trailing;
  }
  return debounce(func, wait, {
    'leading': leading,
    'maxWait': wait,
    'trailing': trailing
  });
}

module.exports = throttle;

},{"./debounce":2,"./isObject":4}],7:[function(require,module,exports){
var isFunction = require('./isFunction'),
    isObject = require('./isObject');

/** Used as references for various `Number` constants. */
var NAN = 0 / 0;

/** Used to match leading and trailing whitespace. */
var reTrim = /^\s+|\s+$/g;

/** Used to detect bad signed hexadecimal string values. */
var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;

/** Used to detect binary string values. */
var reIsBinary = /^0b[01]+$/i;

/** Used to detect octal string values. */
var reIsOctal = /^0o[0-7]+$/i;

/** Built-in method references without a dependency on `root`. */
var freeParseInt = parseInt;

/**
 * Converts `value` to a number.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to process.
 * @returns {number} Returns the number.
 * @example
 *
 * _.toNumber(3);
 * // => 3
 *
 * _.toNumber(Number.MIN_VALUE);
 * // => 5e-324
 *
 * _.toNumber(Infinity);
 * // => Infinity
 *
 * _.toNumber('3');
 * // => 3
 */
function toNumber(value) {
  if (isObject(value)) {
    var other = isFunction(value.valueOf) ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  if (typeof value != 'string') {
    return value === 0 ? value : +value;
  }
  value = value.replace(reTrim, '');
  var isBinary = reIsBinary.test(value);
  return (isBinary || reIsOctal.test(value))
    ? freeParseInt(value.slice(2), isBinary ? 2 : 8)
    : (reIsBadHex.test(value) ? NAN : +value);
}

module.exports = toNumber;

},{"./isFunction":3,"./isObject":4}],8:[function(require,module,exports){
/**
 * Vue and every constructor that extends Vue has an
 * associated options object, which can be accessed during
 * compilation steps as `this.constructor.options`.
 *
 * These can be seen as the default options of every
 * Vue instance.
 */
(function(root, factory) {

    if (typeof module === "object" && module.exports) {
        module.exports = factory(require("interact.js"), require("lodash/throttle"), require("lodash/debounce"));
    } else {
        root.Sortable = factory(root.interact, root._.throttle, root._.debounce);
    }

})(this, function(interact, throttle, debounce){

    var Sortable = function(element, scrollable){
        this.scrollable = scrollable || window.document.body;
        this.element = element;
        this.items   = this.element.querySelectorAll(this.element.dataset.sortable);
        this.element.style.position = "relative";
        this.element.style.webkitTouchCallout = "none";
        this.element.style.webkitUserSelect = "none";
        this.bindEvents();
        this.setPositions();
    };

    /**
    * Bind Events
    */
    Sortable.prototype.bindEvents = function(){
        var self = this;
        window.addEventListener("resize", debounce(function(){
           self.setPositions();
        }, 200));
        interact(this.element.dataset.sortable, {
            context: this.element
        }).draggable({
            inertia: false,
            manualStart: ("ontouchstart" in window) || window.DocumentTouch && window.document instanceof window.DocumentTouch,
            autoScroll: {
                container: this.scrollable === window.document.body ? null : this.scrollable,
                margin: 50,
                speed: 600
            },
            onmove: throttle(function(e){
                self.move(e);
            }, 16, {trailing: false})
        })
        .off("dragstart")
        .off("dragend")
        .off("hold")
        .on("dragstart", function(e){
            var r = e.target.getBoundingClientRect();
            e.target.classList.add("is-dragged");
            e.target.style.transitionDuration = "0s";
            self.startPosition = e.target.dataset.position;
            self.offset = {
                x: e.clientX - r.left,
                y: e.clientY - r.top
            };
            self.scrollTopStart = self.scrollable.scrollTop;
        }).on("dragend", function(e){
            e.target.classList.remove("is-dragged");
            e.target.style.transitionDuration = null;
            self.moveItem(e.target, e.target.dataset.position);
            self.sendResults();
        }).on("hold", function(e){
            if(!e.interaction.interacting()){
                e.interaction.start({
                    name: "drag"
                }, e.interactable, e.currentTarget);
            }
        });
    };

    /**
    * Build the grid
    * - Items position is set to "absolute"
    * - Every items is positioned using transform
    * - Transition duration is set to 0 during this operation
    **/
    Sortable.prototype.setPositions = function(){
        var self = this;
        var rect = this.items[0].getBoundingClientRect();
        this.item_width = Math.floor(rect.width);
        this.item_height = Math.floor(rect.height);
        this.cols = Math.floor(this.element.offsetWidth / this.item_width);
        this.element.style.height = (this.item_height * Math.ceil(this.items.length / this.cols)) + "px";
        for(var i = 0, x = this.items.length; i < x; i++) {
            var item = this.items[i];
            item.style.position = "absolute";
            item.style.top = "0px";
            item.style.left = "0px";
            item.style.transitionDuration = "0s";
            this.moveItem(item, item.dataset.position);
        }
        window.setTimeout(function(){
             for(var i = 0, x = self.items.length; i < x; i++) {
                var item = self.items[i];
                item.style.transitionDuration = null;
             }
        }, 100);
    };

    /**
    * Move an element to follow mouse cursor
    * @param e interact.js event
    */
    Sortable.prototype.move = function(e){
        var p = this.getXY(this.startPosition);
        var x = p.x + e.clientX - e.clientX0;
        var y = p.y + e.clientY - e.clientY0 + this.scrollable.scrollTop - this.scrollTopStart;
        e.target.style.transform = "translate3D(" + x + "px, " + y + "px, 0)";
        var oldPosition = parseInt(e.target.dataset.position, 10);
        var newPosition = this.guessPosition(x + this.offset.x, y + this.offset.y);
        if(oldPosition !== newPosition){
            this.swap(oldPosition, newPosition);
            e.target.dataset.position = newPosition;
        }
        this.guessPosition(x, y);
    };

    /*
    * Get position of an element relative to the parent
    * x:0, y:0 being the top left corner of the container
    */
    Sortable.prototype.getXY = function(position){
        var x = this.item_width * (position % this.cols);
        var y = this.item_height * Math.floor(position / this.cols);
        return {
            x: x,
            y: y
        };
    };

    /**
    * Guess the position number from x, y
    * @param x
    * @param y
    * @returns {number}
    */
    Sortable.prototype.guessPosition = function(x, y){
        var col = Math.floor(x / this.item_width);
        if(col >= this.cols){
            col = this.cols - 1;
        }
        if(col <= 0){
            col = 0;
        }
        var row = Math.floor(y / this.item_height);
        if(row < 0){
            row = 0;
        }
        var position = col + row * this.cols;
        if(position >= this.items.length){
            return this.items.length - 1;
        }
        return position;
    };

    /**
    * Guess the position from x, y
    * @param start
    * @param end
    */
    Sortable.prototype.swap = function(start, end){
        for(var i = 0, x = this.items.length; i < x; i++) {
            var item = this.items[i];
            if(!item.classList.contains("is-dragged")){
                var position = parseInt(item.dataset.position, 10);
                if(position >= end && position < start && end < start){
                    this.moveItem(item, position + 1);
                } else if(position <= end && position > start && end > start){
                    this.moveItem(item, position - 1);
                }
            }
        }
    };

    /**
    * Move an item to his new position
    * @param item
    * @param position
    */
    Sortable.prototype.moveItem = function(item, position){
        var p = this.getXY(position);
        item.style.transform = "translate3D(" + p.x + "px, " + p.y + "px, 0)";
        item.dataset.position = position;
    };

    /**
    * Send results
    * @param item
    * @param position
    */
    Sortable.prototype.sendResults = function(){
        var results = {};
        for(var i = 0, x = this.items.length; i < x; i++) {
            var item = this.items[i];
            results[item.dataset.id] = item.dataset.position;
        }
        this.success(results);
    };

    return Sortable;
});
},{"interact.js":1,"lodash/debounce":2,"lodash/throttle":6}],9:[function(require,module,exports){
// Used for gulp task (useless otherwise)
window.Sortable = require('./Sortable');
},{"./Sortable":8}]},{},[9])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvaW50ZXJhY3QuanMvaW50ZXJhY3QuanMiLCJub2RlX21vZHVsZXMvbG9kYXNoL2RlYm91bmNlLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC9pc0Z1bmN0aW9uLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC9pc09iamVjdC5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gvbm93LmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC90aHJvdHRsZS5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gvdG9OdW1iZXIuanMiLCJzcmMvU29ydGFibGUuanMiLCJzcmMvYnJvd3NlcmlmeS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3gxTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakxBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaE5BO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLyoqXG4gKiBpbnRlcmFjdC5qcyB2MS4yLjZcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTItMjAxNSBUYXllIEFkZXllbWkgPGRldkB0YXllLm1lPlxuICogT3BlbiBzb3VyY2UgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLlxuICogaHR0cHM6Ly9yYXcuZ2l0aHViLmNvbS90YXllL2ludGVyYWN0LmpzL21hc3Rlci9MSUNFTlNFXG4gKi9cbihmdW5jdGlvbiAocmVhbFdpbmRvdykge1xuICAgICd1c2Ugc3RyaWN0JztcblxuICAgIC8vIHJldHVybiBlYXJseSBpZiB0aGVyZSdzIG5vIHdpbmRvdyB0byB3b3JrIHdpdGggKGVnLiBOb2RlLmpzKVxuICAgIGlmICghcmVhbFdpbmRvdykgeyByZXR1cm47IH1cblxuICAgIHZhciAvLyBnZXQgd3JhcHBlZCB3aW5kb3cgaWYgdXNpbmcgU2hhZG93IERPTSBwb2x5ZmlsbFxuICAgICAgICB3aW5kb3cgPSAoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgLy8gY3JlYXRlIGEgVGV4dE5vZGVcbiAgICAgICAgICAgIHZhciBlbCA9IHJlYWxXaW5kb3cuZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoJycpO1xuXG4gICAgICAgICAgICAvLyBjaGVjayBpZiBpdCdzIHdyYXBwZWQgYnkgYSBwb2x5ZmlsbFxuICAgICAgICAgICAgaWYgKGVsLm93bmVyRG9jdW1lbnQgIT09IHJlYWxXaW5kb3cuZG9jdW1lbnRcbiAgICAgICAgICAgICAgICAmJiB0eXBlb2YgcmVhbFdpbmRvdy53cmFwID09PSAnZnVuY3Rpb24nXG4gICAgICAgICAgICAgICAgJiYgcmVhbFdpbmRvdy53cmFwKGVsKSA9PT0gZWwpIHtcbiAgICAgICAgICAgICAgICAvLyByZXR1cm4gd3JhcHBlZCB3aW5kb3dcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVhbFdpbmRvdy53cmFwKHJlYWxXaW5kb3cpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBubyBTaGFkb3cgRE9NIHBvbHlmaWwgb3IgbmF0aXZlIGltcGxlbWVudGF0aW9uXG4gICAgICAgICAgICByZXR1cm4gcmVhbFdpbmRvdztcbiAgICAgICAgfSgpKSxcblxuICAgICAgICBkb2N1bWVudCAgICAgICAgICAgPSB3aW5kb3cuZG9jdW1lbnQsXG4gICAgICAgIERvY3VtZW50RnJhZ21lbnQgICA9IHdpbmRvdy5Eb2N1bWVudEZyYWdtZW50ICAgfHwgYmxhbmssXG4gICAgICAgIFNWR0VsZW1lbnQgICAgICAgICA9IHdpbmRvdy5TVkdFbGVtZW50ICAgICAgICAgfHwgYmxhbmssXG4gICAgICAgIFNWR1NWR0VsZW1lbnQgICAgICA9IHdpbmRvdy5TVkdTVkdFbGVtZW50ICAgICAgfHwgYmxhbmssXG4gICAgICAgIFNWR0VsZW1lbnRJbnN0YW5jZSA9IHdpbmRvdy5TVkdFbGVtZW50SW5zdGFuY2UgfHwgYmxhbmssXG4gICAgICAgIEhUTUxFbGVtZW50ICAgICAgICA9IHdpbmRvdy5IVE1MRWxlbWVudCAgICAgICAgfHwgd2luZG93LkVsZW1lbnQsXG5cbiAgICAgICAgUG9pbnRlckV2ZW50ID0gKHdpbmRvdy5Qb2ludGVyRXZlbnQgfHwgd2luZG93Lk1TUG9pbnRlckV2ZW50KSxcbiAgICAgICAgcEV2ZW50VHlwZXMsXG5cbiAgICAgICAgaHlwb3QgPSBNYXRoLmh5cG90IHx8IGZ1bmN0aW9uICh4LCB5KSB7IHJldHVybiBNYXRoLnNxcnQoeCAqIHggKyB5ICogeSk7IH0sXG5cbiAgICAgICAgdG1wWFkgPSB7fSwgICAgIC8vIHJlZHVjZSBvYmplY3QgY3JlYXRpb24gaW4gZ2V0WFkoKVxuXG4gICAgICAgIGRvY3VtZW50cyAgICAgICA9IFtdLCAgIC8vIGFsbCBkb2N1bWVudHMgYmVpbmcgbGlzdGVuZWQgdG9cblxuICAgICAgICBpbnRlcmFjdGFibGVzICAgPSBbXSwgICAvLyBhbGwgc2V0IGludGVyYWN0YWJsZXNcbiAgICAgICAgaW50ZXJhY3Rpb25zICAgID0gW10sICAgLy8gYWxsIGludGVyYWN0aW9uc1xuXG4gICAgICAgIGR5bmFtaWNEcm9wICAgICA9IGZhbHNlLFxuXG4gICAgICAgIC8vIHtcbiAgICAgICAgLy8gICAgICB0eXBlOiB7XG4gICAgICAgIC8vICAgICAgICAgIHNlbGVjdG9yczogWydzZWxlY3RvcicsIC4uLl0sXG4gICAgICAgIC8vICAgICAgICAgIGNvbnRleHRzIDogW2RvY3VtZW50LCAuLi5dLFxuICAgICAgICAvLyAgICAgICAgICBsaXN0ZW5lcnM6IFtbbGlzdGVuZXIsIHVzZUNhcHR1cmVdLCAuLi5dXG4gICAgICAgIC8vICAgICAgfVxuICAgICAgICAvLyAgfVxuICAgICAgICBkZWxlZ2F0ZWRFdmVudHMgPSB7fSxcblxuICAgICAgICBkZWZhdWx0T3B0aW9ucyA9IHtcbiAgICAgICAgICAgIGJhc2U6IHtcbiAgICAgICAgICAgICAgICBhY2NlcHQgICAgICAgIDogbnVsbCxcbiAgICAgICAgICAgICAgICBhY3Rpb25DaGVja2VyIDogbnVsbCxcbiAgICAgICAgICAgICAgICBzdHlsZUN1cnNvciAgIDogdHJ1ZSxcbiAgICAgICAgICAgICAgICBwcmV2ZW50RGVmYXVsdDogJ2F1dG8nLFxuICAgICAgICAgICAgICAgIG9yaWdpbiAgICAgICAgOiB7IHg6IDAsIHk6IDAgfSxcbiAgICAgICAgICAgICAgICBkZWx0YVNvdXJjZSAgIDogJ3BhZ2UnLFxuICAgICAgICAgICAgICAgIGFsbG93RnJvbSAgICAgOiBudWxsLFxuICAgICAgICAgICAgICAgIGlnbm9yZUZyb20gICAgOiBudWxsLFxuICAgICAgICAgICAgICAgIF9jb250ZXh0ICAgICAgOiBkb2N1bWVudCxcbiAgICAgICAgICAgICAgICBkcm9wQ2hlY2tlciAgIDogbnVsbFxuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgZHJhZzoge1xuICAgICAgICAgICAgICAgIGVuYWJsZWQ6IGZhbHNlLFxuICAgICAgICAgICAgICAgIG1hbnVhbFN0YXJ0OiB0cnVlLFxuICAgICAgICAgICAgICAgIG1heDogSW5maW5pdHksXG4gICAgICAgICAgICAgICAgbWF4UGVyRWxlbWVudDogMSxcblxuICAgICAgICAgICAgICAgIHNuYXA6IG51bGwsXG4gICAgICAgICAgICAgICAgcmVzdHJpY3Q6IG51bGwsXG4gICAgICAgICAgICAgICAgaW5lcnRpYTogbnVsbCxcbiAgICAgICAgICAgICAgICBhdXRvU2Nyb2xsOiBudWxsLFxuXG4gICAgICAgICAgICAgICAgYXhpczogJ3h5J1xuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgZHJvcDoge1xuICAgICAgICAgICAgICAgIGVuYWJsZWQ6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGFjY2VwdDogbnVsbCxcbiAgICAgICAgICAgICAgICBvdmVybGFwOiAncG9pbnRlcidcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIHJlc2l6ZToge1xuICAgICAgICAgICAgICAgIGVuYWJsZWQ6IGZhbHNlLFxuICAgICAgICAgICAgICAgIG1hbnVhbFN0YXJ0OiBmYWxzZSxcbiAgICAgICAgICAgICAgICBtYXg6IEluZmluaXR5LFxuICAgICAgICAgICAgICAgIG1heFBlckVsZW1lbnQ6IDEsXG5cbiAgICAgICAgICAgICAgICBzbmFwOiBudWxsLFxuICAgICAgICAgICAgICAgIHJlc3RyaWN0OiBudWxsLFxuICAgICAgICAgICAgICAgIGluZXJ0aWE6IG51bGwsXG4gICAgICAgICAgICAgICAgYXV0b1Njcm9sbDogbnVsbCxcblxuICAgICAgICAgICAgICAgIHNxdWFyZTogZmFsc2UsXG4gICAgICAgICAgICAgICAgcHJlc2VydmVBc3BlY3RSYXRpbzogZmFsc2UsXG4gICAgICAgICAgICAgICAgYXhpczogJ3h5JyxcblxuICAgICAgICAgICAgICAgIC8vIHVzZSBkZWZhdWx0IG1hcmdpblxuICAgICAgICAgICAgICAgIG1hcmdpbjogTmFOLFxuXG4gICAgICAgICAgICAgICAgLy8gb2JqZWN0IHdpdGggcHJvcHMgbGVmdCwgcmlnaHQsIHRvcCwgYm90dG9tIHdoaWNoIGFyZVxuICAgICAgICAgICAgICAgIC8vIHRydWUvZmFsc2UgdmFsdWVzIHRvIHJlc2l6ZSB3aGVuIHRoZSBwb2ludGVyIGlzIG92ZXIgdGhhdCBlZGdlLFxuICAgICAgICAgICAgICAgIC8vIENTUyBzZWxlY3RvcnMgdG8gbWF0Y2ggdGhlIGhhbmRsZXMgZm9yIGVhY2ggZGlyZWN0aW9uXG4gICAgICAgICAgICAgICAgLy8gb3IgdGhlIEVsZW1lbnRzIGZvciBlYWNoIGhhbmRsZVxuICAgICAgICAgICAgICAgIGVkZ2VzOiBudWxsLFxuXG4gICAgICAgICAgICAgICAgLy8gYSB2YWx1ZSBvZiAnbm9uZScgd2lsbCBsaW1pdCB0aGUgcmVzaXplIHJlY3QgdG8gYSBtaW5pbXVtIG9mIDB4MFxuICAgICAgICAgICAgICAgIC8vICduZWdhdGUnIHdpbGwgYWxvdyB0aGUgcmVjdCB0byBoYXZlIG5lZ2F0aXZlIHdpZHRoL2hlaWdodFxuICAgICAgICAgICAgICAgIC8vICdyZXBvc2l0aW9uJyB3aWxsIGtlZXAgdGhlIHdpZHRoL2hlaWdodCBwb3NpdGl2ZSBieSBzd2FwcGluZ1xuICAgICAgICAgICAgICAgIC8vIHRoZSB0b3AgYW5kIGJvdHRvbSBlZGdlcyBhbmQvb3Igc3dhcHBpbmcgdGhlIGxlZnQgYW5kIHJpZ2h0IGVkZ2VzXG4gICAgICAgICAgICAgICAgaW52ZXJ0OiAnbm9uZSdcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIGdlc3R1cmU6IHtcbiAgICAgICAgICAgICAgICBtYW51YWxTdGFydDogZmFsc2UsXG4gICAgICAgICAgICAgICAgZW5hYmxlZDogZmFsc2UsXG4gICAgICAgICAgICAgICAgbWF4OiBJbmZpbml0eSxcbiAgICAgICAgICAgICAgICBtYXhQZXJFbGVtZW50OiAxLFxuXG4gICAgICAgICAgICAgICAgcmVzdHJpY3Q6IG51bGxcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIHBlckFjdGlvbjoge1xuICAgICAgICAgICAgICAgIG1hbnVhbFN0YXJ0OiBmYWxzZSxcbiAgICAgICAgICAgICAgICBtYXg6IEluZmluaXR5LFxuICAgICAgICAgICAgICAgIG1heFBlckVsZW1lbnQ6IDEsXG5cbiAgICAgICAgICAgICAgICBzbmFwOiB7XG4gICAgICAgICAgICAgICAgICAgIGVuYWJsZWQgICAgIDogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGVuZE9ubHkgICAgIDogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIHJhbmdlICAgICAgIDogSW5maW5pdHksXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldHMgICAgIDogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgb2Zmc2V0cyAgICAgOiBudWxsLFxuXG4gICAgICAgICAgICAgICAgICAgIHJlbGF0aXZlUG9pbnRzOiBudWxsXG4gICAgICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgICAgIHJlc3RyaWN0OiB7XG4gICAgICAgICAgICAgICAgICAgIGVuYWJsZWQ6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBlbmRPbmx5OiBmYWxzZVxuICAgICAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgICAgICBhdXRvU2Nyb2xsOiB7XG4gICAgICAgICAgICAgICAgICAgIGVuYWJsZWQgICAgIDogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGNvbnRhaW5lciAgIDogbnVsbCwgICAgIC8vIHRoZSBpdGVtIHRoYXQgaXMgc2Nyb2xsZWQgKFdpbmRvdyBvciBIVE1MRWxlbWVudClcbiAgICAgICAgICAgICAgICAgICAgbWFyZ2luICAgICAgOiA2MCxcbiAgICAgICAgICAgICAgICAgICAgc3BlZWQgICAgICAgOiAzMDAgICAgICAgLy8gdGhlIHNjcm9sbCBzcGVlZCBpbiBwaXhlbHMgcGVyIHNlY29uZFxuICAgICAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgICAgICBpbmVydGlhOiB7XG4gICAgICAgICAgICAgICAgICAgIGVuYWJsZWQgICAgICAgICAgOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgcmVzaXN0YW5jZSAgICAgICA6IDEwLCAgICAvLyB0aGUgbGFtYmRhIGluIGV4cG9uZW50aWFsIGRlY2F5XG4gICAgICAgICAgICAgICAgICAgIG1pblNwZWVkICAgICAgICAgOiAxMDAsICAgLy8gdGFyZ2V0IHNwZWVkIG11c3QgYmUgYWJvdmUgdGhpcyBmb3IgaW5lcnRpYSB0byBzdGFydFxuICAgICAgICAgICAgICAgICAgICBlbmRTcGVlZCAgICAgICAgIDogMTAsICAgIC8vIHRoZSBzcGVlZCBhdCB3aGljaCBpbmVydGlhIGlzIHNsb3cgZW5vdWdoIHRvIHN0b3BcbiAgICAgICAgICAgICAgICAgICAgYWxsb3dSZXN1bWUgICAgICA6IHRydWUsICAvLyBhbGxvdyByZXN1bWluZyBhbiBhY3Rpb24gaW4gaW5lcnRpYSBwaGFzZVxuICAgICAgICAgICAgICAgICAgICB6ZXJvUmVzdW1lRGVsdGEgIDogdHJ1ZSwgIC8vIGlmIGFuIGFjdGlvbiBpcyByZXN1bWVkIGFmdGVyIGxhdW5jaCwgc2V0IGR4L2R5IHRvIDBcbiAgICAgICAgICAgICAgICAgICAgc21vb3RoRW5kRHVyYXRpb246IDMwMCAgICAvLyBhbmltYXRlIHRvIHNuYXAvcmVzdHJpY3QgZW5kT25seSBpZiB0aGVyZSdzIG5vIGluZXJ0aWFcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBfaG9sZER1cmF0aW9uOiA2MDBcbiAgICAgICAgfSxcblxuICAgICAgICAvLyBUaGluZ3MgcmVsYXRlZCB0byBhdXRvU2Nyb2xsXG4gICAgICAgIGF1dG9TY3JvbGwgPSB7XG4gICAgICAgICAgICBpbnRlcmFjdGlvbjogbnVsbCxcbiAgICAgICAgICAgIGk6IG51bGwsICAgIC8vIHRoZSBoYW5kbGUgcmV0dXJuZWQgYnkgd2luZG93LnNldEludGVydmFsXG4gICAgICAgICAgICB4OiAwLCB5OiAwLCAvLyBEaXJlY3Rpb24gZWFjaCBwdWxzZSBpcyB0byBzY3JvbGwgaW5cblxuICAgICAgICAgICAgLy8gc2Nyb2xsIHRoZSB3aW5kb3cgYnkgdGhlIHZhbHVlcyBpbiBzY3JvbGwueC95XG4gICAgICAgICAgICBzY3JvbGw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICB2YXIgb3B0aW9ucyA9IGF1dG9TY3JvbGwuaW50ZXJhY3Rpb24udGFyZ2V0Lm9wdGlvbnNbYXV0b1Njcm9sbC5pbnRlcmFjdGlvbi5wcmVwYXJlZC5uYW1lXS5hdXRvU2Nyb2xsLFxuICAgICAgICAgICAgICAgICAgICBjb250YWluZXIgPSBvcHRpb25zLmNvbnRhaW5lciB8fCBnZXRXaW5kb3coYXV0b1Njcm9sbC5pbnRlcmFjdGlvbi5lbGVtZW50KSxcbiAgICAgICAgICAgICAgICAgICAgbm93ID0gbmV3IERhdGUoKS5nZXRUaW1lKCksXG4gICAgICAgICAgICAgICAgICAgIC8vIGNoYW5nZSBpbiB0aW1lIGluIHNlY29uZHNcbiAgICAgICAgICAgICAgICAgICAgZHR4ID0gKG5vdyAtIGF1dG9TY3JvbGwucHJldlRpbWVYKSAvIDEwMDAsXG4gICAgICAgICAgICAgICAgICAgIGR0eSA9IChub3cgLSBhdXRvU2Nyb2xsLnByZXZUaW1lWSkgLyAxMDAwLFxuICAgICAgICAgICAgICAgICAgICB2eCwgdnksIHN4LCBzeTtcblxuICAgICAgICAgICAgICAgIC8vIGRpc3BsYWNlbWVudFxuICAgICAgICAgICAgICAgIGlmIChvcHRpb25zLnZlbG9jaXR5KSB7XG4gICAgICAgICAgICAgICAgICB2eCA9IG9wdGlvbnMudmVsb2NpdHkueDtcbiAgICAgICAgICAgICAgICAgIHZ5ID0gb3B0aW9ucy52ZWxvY2l0eS55O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHZ4ID0gdnkgPSBvcHRpb25zLnNwZWVkXG4gICAgICAgICAgICAgICAgfVxuIFxuICAgICAgICAgICAgICAgIHN4ID0gdnggKiBkdHg7XG4gICAgICAgICAgICAgICAgc3kgPSB2eSAqIGR0eTtcblxuICAgICAgICAgICAgICAgIGlmIChzeCA+PSAxIHx8IHN5ID49IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGlzV2luZG93KGNvbnRhaW5lcikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRhaW5lci5zY3JvbGxCeShhdXRvU2Nyb2xsLnggKiBzeCwgYXV0b1Njcm9sbC55ICogc3kpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKGNvbnRhaW5lcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29udGFpbmVyLnNjcm9sbExlZnQgKz0gYXV0b1Njcm9sbC54ICogc3g7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250YWluZXIuc2Nyb2xsVG9wICArPSBhdXRvU2Nyb2xsLnkgKiBzeTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlmIChzeCA+PTEpIGF1dG9TY3JvbGwucHJldlRpbWVYID0gbm93O1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3kgPj0gMSkgYXV0b1Njcm9sbC5wcmV2VGltZVkgPSBub3c7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGF1dG9TY3JvbGwuaXNTY3JvbGxpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgY2FuY2VsRnJhbWUoYXV0b1Njcm9sbC5pKTtcbiAgICAgICAgICAgICAgICAgICAgYXV0b1Njcm9sbC5pID0gcmVxRnJhbWUoYXV0b1Njcm9sbC5zY3JvbGwpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIGlzU2Nyb2xsaW5nOiBmYWxzZSxcbiAgICAgICAgICAgIHByZXZUaW1lWDogMCxcbiAgICAgICAgICAgIHByZXZUaW1lWTogMCxcblxuICAgICAgICAgICAgc3RhcnQ6IGZ1bmN0aW9uIChpbnRlcmFjdGlvbikge1xuICAgICAgICAgICAgICAgIGF1dG9TY3JvbGwuaXNTY3JvbGxpbmcgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGNhbmNlbEZyYW1lKGF1dG9TY3JvbGwuaSk7XG5cbiAgICAgICAgICAgICAgICBhdXRvU2Nyb2xsLmludGVyYWN0aW9uID0gaW50ZXJhY3Rpb247XG4gICAgICAgICAgICAgICAgYXV0b1Njcm9sbC5wcmV2VGltZVggPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICAgICAgICAgICAgICBhdXRvU2Nyb2xsLnByZXZUaW1lWSA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgICAgICAgICAgICAgIGF1dG9TY3JvbGwuaSA9IHJlcUZyYW1lKGF1dG9TY3JvbGwuc2Nyb2xsKTtcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIHN0b3A6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBhdXRvU2Nyb2xsLmlzU2Nyb2xsaW5nID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgY2FuY2VsRnJhbWUoYXV0b1Njcm9sbC5pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICAvLyBEb2VzIHRoZSBicm93c2VyIHN1cHBvcnQgdG91Y2ggaW5wdXQ/XG4gICAgICAgIHN1cHBvcnRzVG91Y2ggPSAoKCdvbnRvdWNoc3RhcnQnIGluIHdpbmRvdykgfHwgd2luZG93LkRvY3VtZW50VG91Y2ggJiYgZG9jdW1lbnQgaW5zdGFuY2VvZiB3aW5kb3cuRG9jdW1lbnRUb3VjaCksXG5cbiAgICAgICAgLy8gRG9lcyB0aGUgYnJvd3NlciBzdXBwb3J0IFBvaW50ZXJFdmVudHNcbiAgICAgICAgc3VwcG9ydHNQb2ludGVyRXZlbnQgPSAhIVBvaW50ZXJFdmVudCxcblxuICAgICAgICAvLyBMZXNzIFByZWNpc2lvbiB3aXRoIHRvdWNoIGlucHV0XG4gICAgICAgIG1hcmdpbiA9IHN1cHBvcnRzVG91Y2ggfHwgc3VwcG9ydHNQb2ludGVyRXZlbnQ/IDIwOiAxMCxcblxuICAgICAgICBwb2ludGVyTW92ZVRvbGVyYW5jZSA9IDEsXG5cbiAgICAgICAgLy8gZm9yIGlnbm9yaW5nIGJyb3dzZXIncyBzaW11bGF0ZWQgbW91c2UgZXZlbnRzXG4gICAgICAgIHByZXZUb3VjaFRpbWUgPSAwLFxuXG4gICAgICAgIC8vIEFsbG93IHRoaXMgbWFueSBpbnRlcmFjdGlvbnMgdG8gaGFwcGVuIHNpbXVsdGFuZW91c2x5XG4gICAgICAgIG1heEludGVyYWN0aW9ucyA9IEluZmluaXR5LFxuXG4gICAgICAgIC8vIENoZWNrIGlmIGlzIElFOSBvciBvbGRlclxuICAgICAgICBhY3Rpb25DdXJzb3JzID0gKGRvY3VtZW50LmFsbCAmJiAhd2luZG93LmF0b2IpID8ge1xuICAgICAgICAgICAgZHJhZyAgICA6ICdtb3ZlJyxcbiAgICAgICAgICAgIHJlc2l6ZXggOiAnZS1yZXNpemUnLFxuICAgICAgICAgICAgcmVzaXpleSA6ICdzLXJlc2l6ZScsXG4gICAgICAgICAgICByZXNpemV4eTogJ3NlLXJlc2l6ZScsXG5cbiAgICAgICAgICAgIHJlc2l6ZXRvcCAgICAgICAgOiAnbi1yZXNpemUnLFxuICAgICAgICAgICAgcmVzaXplbGVmdCAgICAgICA6ICd3LXJlc2l6ZScsXG4gICAgICAgICAgICByZXNpemVib3R0b20gICAgIDogJ3MtcmVzaXplJyxcbiAgICAgICAgICAgIHJlc2l6ZXJpZ2h0ICAgICAgOiAnZS1yZXNpemUnLFxuICAgICAgICAgICAgcmVzaXpldG9wbGVmdCAgICA6ICdzZS1yZXNpemUnLFxuICAgICAgICAgICAgcmVzaXplYm90dG9tcmlnaHQ6ICdzZS1yZXNpemUnLFxuICAgICAgICAgICAgcmVzaXpldG9wcmlnaHQgICA6ICduZS1yZXNpemUnLFxuICAgICAgICAgICAgcmVzaXplYm90dG9tbGVmdCA6ICduZS1yZXNpemUnLFxuXG4gICAgICAgICAgICBnZXN0dXJlIDogJydcbiAgICAgICAgfSA6IHtcbiAgICAgICAgICAgIGRyYWcgICAgOiAnbW92ZScsXG4gICAgICAgICAgICByZXNpemV4IDogJ2V3LXJlc2l6ZScsXG4gICAgICAgICAgICByZXNpemV5IDogJ25zLXJlc2l6ZScsXG4gICAgICAgICAgICByZXNpemV4eTogJ253c2UtcmVzaXplJyxcblxuICAgICAgICAgICAgcmVzaXpldG9wICAgICAgICA6ICducy1yZXNpemUnLFxuICAgICAgICAgICAgcmVzaXplbGVmdCAgICAgICA6ICdldy1yZXNpemUnLFxuICAgICAgICAgICAgcmVzaXplYm90dG9tICAgICA6ICducy1yZXNpemUnLFxuICAgICAgICAgICAgcmVzaXplcmlnaHQgICAgICA6ICdldy1yZXNpemUnLFxuICAgICAgICAgICAgcmVzaXpldG9wbGVmdCAgICA6ICdud3NlLXJlc2l6ZScsXG4gICAgICAgICAgICByZXNpemVib3R0b21yaWdodDogJ253c2UtcmVzaXplJyxcbiAgICAgICAgICAgIHJlc2l6ZXRvcHJpZ2h0ICAgOiAnbmVzdy1yZXNpemUnLFxuICAgICAgICAgICAgcmVzaXplYm90dG9tbGVmdCA6ICduZXN3LXJlc2l6ZScsXG5cbiAgICAgICAgICAgIGdlc3R1cmUgOiAnJ1xuICAgICAgICB9LFxuXG4gICAgICAgIGFjdGlvbklzRW5hYmxlZCA9IHtcbiAgICAgICAgICAgIGRyYWcgICA6IHRydWUsXG4gICAgICAgICAgICByZXNpemUgOiB0cnVlLFxuICAgICAgICAgICAgZ2VzdHVyZTogdHJ1ZVxuICAgICAgICB9LFxuXG4gICAgICAgIC8vIGJlY2F1c2UgV2Via2l0IGFuZCBPcGVyYSBzdGlsbCB1c2UgJ21vdXNld2hlZWwnIGV2ZW50IHR5cGVcbiAgICAgICAgd2hlZWxFdmVudCA9ICdvbm1vdXNld2hlZWwnIGluIGRvY3VtZW50PyAnbW91c2V3aGVlbCc6ICd3aGVlbCcsXG5cbiAgICAgICAgZXZlbnRUeXBlcyA9IFtcbiAgICAgICAgICAgICdkcmFnc3RhcnQnLFxuICAgICAgICAgICAgJ2RyYWdtb3ZlJyxcbiAgICAgICAgICAgICdkcmFnaW5lcnRpYXN0YXJ0JyxcbiAgICAgICAgICAgICdkcmFnZW5kJyxcbiAgICAgICAgICAgICdkcmFnZW50ZXInLFxuICAgICAgICAgICAgJ2RyYWdsZWF2ZScsXG4gICAgICAgICAgICAnZHJvcGFjdGl2YXRlJyxcbiAgICAgICAgICAgICdkcm9wZGVhY3RpdmF0ZScsXG4gICAgICAgICAgICAnZHJvcG1vdmUnLFxuICAgICAgICAgICAgJ2Ryb3AnLFxuICAgICAgICAgICAgJ3Jlc2l6ZXN0YXJ0JyxcbiAgICAgICAgICAgICdyZXNpemVtb3ZlJyxcbiAgICAgICAgICAgICdyZXNpemVpbmVydGlhc3RhcnQnLFxuICAgICAgICAgICAgJ3Jlc2l6ZWVuZCcsXG4gICAgICAgICAgICAnZ2VzdHVyZXN0YXJ0JyxcbiAgICAgICAgICAgICdnZXN0dXJlbW92ZScsXG4gICAgICAgICAgICAnZ2VzdHVyZWluZXJ0aWFzdGFydCcsXG4gICAgICAgICAgICAnZ2VzdHVyZWVuZCcsXG5cbiAgICAgICAgICAgICdkb3duJyxcbiAgICAgICAgICAgICdtb3ZlJyxcbiAgICAgICAgICAgICd1cCcsXG4gICAgICAgICAgICAnY2FuY2VsJyxcbiAgICAgICAgICAgICd0YXAnLFxuICAgICAgICAgICAgJ2RvdWJsZXRhcCcsXG4gICAgICAgICAgICAnaG9sZCdcbiAgICAgICAgXSxcblxuICAgICAgICBnbG9iYWxFdmVudHMgPSB7fSxcblxuICAgICAgICAvLyBPcGVyYSBNb2JpbGUgbXVzdCBiZSBoYW5kbGVkIGRpZmZlcmVudGx5XG4gICAgICAgIGlzT3BlcmFNb2JpbGUgPSBuYXZpZ2F0b3IuYXBwTmFtZSA9PSAnT3BlcmEnICYmXG4gICAgICAgICAgICBzdXBwb3J0c1RvdWNoICYmXG4gICAgICAgICAgICBuYXZpZ2F0b3IudXNlckFnZW50Lm1hdGNoKCdQcmVzdG8nKSxcblxuICAgICAgICAvLyBzY3JvbGxpbmcgZG9lc24ndCBjaGFuZ2UgdGhlIHJlc3VsdCBvZiBnZXRDbGllbnRSZWN0cyBvbiBpT1MgN1xuICAgICAgICBpc0lPUzcgPSAoL2lQKGhvbmV8b2R8YWQpLy50ZXN0KG5hdmlnYXRvci5wbGF0Zm9ybSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAmJiAvT1MgN1teXFxkXS8udGVzdChuYXZpZ2F0b3IuYXBwVmVyc2lvbikpLFxuXG4gICAgICAgIC8vIHByZWZpeCBtYXRjaGVzU2VsZWN0b3JcbiAgICAgICAgcHJlZml4ZWRNYXRjaGVzU2VsZWN0b3IgPSAnbWF0Y2hlcycgaW4gRWxlbWVudC5wcm90b3R5cGU/XG4gICAgICAgICAgICAgICAgJ21hdGNoZXMnOiAnd2Via2l0TWF0Y2hlc1NlbGVjdG9yJyBpbiBFbGVtZW50LnByb3RvdHlwZT9cbiAgICAgICAgICAgICAgICAgICAgJ3dlYmtpdE1hdGNoZXNTZWxlY3Rvcic6ICdtb3pNYXRjaGVzU2VsZWN0b3InIGluIEVsZW1lbnQucHJvdG90eXBlP1xuICAgICAgICAgICAgICAgICAgICAgICAgJ21vek1hdGNoZXNTZWxlY3Rvcic6ICdvTWF0Y2hlc1NlbGVjdG9yJyBpbiBFbGVtZW50LnByb3RvdHlwZT9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAnb01hdGNoZXNTZWxlY3Rvcic6ICdtc01hdGNoZXNTZWxlY3RvcicsXG5cbiAgICAgICAgLy8gd2lsbCBiZSBwb2x5ZmlsbCBmdW5jdGlvbiBpZiBicm93c2VyIGlzIElFOFxuICAgICAgICBpZThNYXRjaGVzU2VsZWN0b3IsXG5cbiAgICAgICAgLy8gbmF0aXZlIHJlcXVlc3RBbmltYXRpb25GcmFtZSBvciBwb2x5ZmlsbFxuICAgICAgICByZXFGcmFtZSA9IHJlYWxXaW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lLFxuICAgICAgICBjYW5jZWxGcmFtZSA9IHJlYWxXaW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUsXG5cbiAgICAgICAgLy8gRXZlbnRzIHdyYXBwZXJcbiAgICAgICAgZXZlbnRzID0gKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciB1c2VBdHRhY2hFdmVudCA9ICgnYXR0YWNoRXZlbnQnIGluIHdpbmRvdykgJiYgISgnYWRkRXZlbnRMaXN0ZW5lcicgaW4gd2luZG93KSxcbiAgICAgICAgICAgICAgICBhZGRFdmVudCAgICAgICA9IHVzZUF0dGFjaEV2ZW50PyAgJ2F0dGFjaEV2ZW50JzogJ2FkZEV2ZW50TGlzdGVuZXInLFxuICAgICAgICAgICAgICAgIHJlbW92ZUV2ZW50ICAgID0gdXNlQXR0YWNoRXZlbnQ/ICAnZGV0YWNoRXZlbnQnOiAncmVtb3ZlRXZlbnRMaXN0ZW5lcicsXG4gICAgICAgICAgICAgICAgb24gICAgICAgICAgICAgPSB1c2VBdHRhY2hFdmVudD8gJ29uJzogJycsXG5cbiAgICAgICAgICAgICAgICBlbGVtZW50cyAgICAgICAgICA9IFtdLFxuICAgICAgICAgICAgICAgIHRhcmdldHMgICAgICAgICAgID0gW10sXG4gICAgICAgICAgICAgICAgYXR0YWNoZWRMaXN0ZW5lcnMgPSBbXTtcblxuICAgICAgICAgICAgZnVuY3Rpb24gYWRkIChlbGVtZW50LCB0eXBlLCBsaXN0ZW5lciwgdXNlQ2FwdHVyZSkge1xuICAgICAgICAgICAgICAgIHZhciBlbGVtZW50SW5kZXggPSBpbmRleE9mKGVsZW1lbnRzLCBlbGVtZW50KSxcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0ID0gdGFyZ2V0c1tlbGVtZW50SW5kZXhdO1xuXG4gICAgICAgICAgICAgICAgaWYgKCF0YXJnZXQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0ID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnRzOiB7fSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVDb3VudDogMFxuICAgICAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnRJbmRleCA9IGVsZW1lbnRzLnB1c2goZWxlbWVudCkgLSAxO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXRzLnB1c2godGFyZ2V0KTtcblxuICAgICAgICAgICAgICAgICAgICBhdHRhY2hlZExpc3RlbmVycy5wdXNoKCh1c2VBdHRhY2hFdmVudCA/IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdXBwbGllZDogW10sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgd3JhcHBlZCA6IFtdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVzZUNvdW50OiBbXVxuICAgICAgICAgICAgICAgICAgICAgICAgfSA6IG51bGwpKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoIXRhcmdldC5ldmVudHNbdHlwZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0LmV2ZW50c1t0eXBlXSA9IFtdO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQudHlwZUNvdW50Kys7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKCFjb250YWlucyh0YXJnZXQuZXZlbnRzW3R5cGVdLCBsaXN0ZW5lcikpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHJldDtcblxuICAgICAgICAgICAgICAgICAgICBpZiAodXNlQXR0YWNoRXZlbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBsaXN0ZW5lcnMgPSBhdHRhY2hlZExpc3RlbmVyc1tlbGVtZW50SW5kZXhdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpc3RlbmVySW5kZXggPSBpbmRleE9mKGxpc3RlbmVycy5zdXBwbGllZCwgbGlzdGVuZXIpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgd3JhcHBlZCA9IGxpc3RlbmVycy53cmFwcGVkW2xpc3RlbmVySW5kZXhdIHx8IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghZXZlbnQuaW1tZWRpYXRlUHJvcGFnYXRpb25TdG9wcGVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50LnRhcmdldCA9IGV2ZW50LnNyY0VsZW1lbnQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50LmN1cnJlbnRUYXJnZXQgPSBlbGVtZW50O1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0ID0gZXZlbnQucHJldmVudERlZmF1bHQgfHwgcHJldmVudERlZjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uID0gZXZlbnQuc3RvcFByb3BhZ2F0aW9uIHx8IHN0b3BQcm9wO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBldmVudC5zdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24gPSBldmVudC5zdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24gfHwgc3RvcEltbVByb3A7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKC9tb3VzZXxjbGljay8udGVzdChldmVudC50eXBlKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnQucGFnZVggPSBldmVudC5jbGllbnRYICsgZ2V0V2luZG93KGVsZW1lbnQpLmRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zY3JvbGxMZWZ0O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnQucGFnZVkgPSBldmVudC5jbGllbnRZICsgZ2V0V2luZG93KGVsZW1lbnQpLmRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zY3JvbGxUb3A7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lcihldmVudCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0ID0gZWxlbWVudFthZGRFdmVudF0ob24gKyB0eXBlLCB3cmFwcGVkLCBCb29sZWFuKHVzZUNhcHR1cmUpKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGxpc3RlbmVySW5kZXggPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXJzLnN1cHBsaWVkLnB1c2gobGlzdGVuZXIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpc3RlbmVycy53cmFwcGVkLnB1c2god3JhcHBlZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXJzLnVzZUNvdW50LnB1c2goMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lcnMudXNlQ291bnRbbGlzdGVuZXJJbmRleF0rKztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldCA9IGVsZW1lbnRbYWRkRXZlbnRdKHR5cGUsIGxpc3RlbmVyLCB1c2VDYXB0dXJlIHx8IGZhbHNlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0YXJnZXQuZXZlbnRzW3R5cGVdLnB1c2gobGlzdGVuZXIpO1xuXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZXQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmdW5jdGlvbiByZW1vdmUgKGVsZW1lbnQsIHR5cGUsIGxpc3RlbmVyLCB1c2VDYXB0dXJlKSB7XG4gICAgICAgICAgICAgICAgdmFyIGksXG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnRJbmRleCA9IGluZGV4T2YoZWxlbWVudHMsIGVsZW1lbnQpLFxuICAgICAgICAgICAgICAgICAgICB0YXJnZXQgPSB0YXJnZXRzW2VsZW1lbnRJbmRleF0sXG4gICAgICAgICAgICAgICAgICAgIGxpc3RlbmVycyxcbiAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXJJbmRleCxcbiAgICAgICAgICAgICAgICAgICAgd3JhcHBlZCA9IGxpc3RlbmVyO1xuXG4gICAgICAgICAgICAgICAgaWYgKCF0YXJnZXQgfHwgIXRhcmdldC5ldmVudHMpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh1c2VBdHRhY2hFdmVudCkge1xuICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lcnMgPSBhdHRhY2hlZExpc3RlbmVyc1tlbGVtZW50SW5kZXhdO1xuICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lckluZGV4ID0gaW5kZXhPZihsaXN0ZW5lcnMuc3VwcGxpZWQsIGxpc3RlbmVyKTtcbiAgICAgICAgICAgICAgICAgICAgd3JhcHBlZCA9IGxpc3RlbmVycy53cmFwcGVkW2xpc3RlbmVySW5kZXhdO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh0eXBlID09PSAnYWxsJykge1xuICAgICAgICAgICAgICAgICAgICBmb3IgKHR5cGUgaW4gdGFyZ2V0LmV2ZW50cykge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRhcmdldC5ldmVudHMuaGFzT3duUHJvcGVydHkodHlwZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZW1vdmUoZWxlbWVudCwgdHlwZSwgJ2FsbCcpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0LmV2ZW50c1t0eXBlXSkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgbGVuID0gdGFyZ2V0LmV2ZW50c1t0eXBlXS5sZW5ndGg7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGxpc3RlbmVyID09PSAnYWxsJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVtb3ZlKGVsZW1lbnQsIHR5cGUsIHRhcmdldC5ldmVudHNbdHlwZV1baV0sIEJvb2xlYW4odXNlQ2FwdHVyZSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRhcmdldC5ldmVudHNbdHlwZV1baV0gPT09IGxpc3RlbmVyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnRbcmVtb3ZlRXZlbnRdKG9uICsgdHlwZSwgd3JhcHBlZCwgdXNlQ2FwdHVyZSB8fCBmYWxzZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldC5ldmVudHNbdHlwZV0uc3BsaWNlKGksIDEpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh1c2VBdHRhY2hFdmVudCAmJiBsaXN0ZW5lcnMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpc3RlbmVycy51c2VDb3VudFtsaXN0ZW5lckluZGV4XS0tO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGxpc3RlbmVycy51c2VDb3VudFtsaXN0ZW5lckluZGV4XSA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpc3RlbmVycy5zdXBwbGllZC5zcGxpY2UobGlzdGVuZXJJbmRleCwgMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXJzLndyYXBwZWQuc3BsaWNlKGxpc3RlbmVySW5kZXgsIDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpc3RlbmVycy51c2VDb3VudC5zcGxpY2UobGlzdGVuZXJJbmRleCwgMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAodGFyZ2V0LmV2ZW50c1t0eXBlXSAmJiB0YXJnZXQuZXZlbnRzW3R5cGVdLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0LmV2ZW50c1t0eXBlXSA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXQudHlwZUNvdW50LS07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoIXRhcmdldC50eXBlQ291bnQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0cy5zcGxpY2UoZWxlbWVudEluZGV4LCAxKTtcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudHMuc3BsaWNlKGVsZW1lbnRJbmRleCwgMSk7XG4gICAgICAgICAgICAgICAgICAgIGF0dGFjaGVkTGlzdGVuZXJzLnNwbGljZShlbGVtZW50SW5kZXgsIDEpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZnVuY3Rpb24gcHJldmVudERlZiAoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5yZXR1cm5WYWx1ZSA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmdW5jdGlvbiBzdG9wUHJvcCAoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW5jZWxCdWJibGUgPSB0cnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmdW5jdGlvbiBzdG9wSW1tUHJvcCAoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW5jZWxCdWJibGUgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHRoaXMuaW1tZWRpYXRlUHJvcGFnYXRpb25TdG9wcGVkID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBhZGQ6IGFkZCxcbiAgICAgICAgICAgICAgICByZW1vdmU6IHJlbW92ZSxcbiAgICAgICAgICAgICAgICB1c2VBdHRhY2hFdmVudDogdXNlQXR0YWNoRXZlbnQsXG5cbiAgICAgICAgICAgICAgICBfZWxlbWVudHM6IGVsZW1lbnRzLFxuICAgICAgICAgICAgICAgIF90YXJnZXRzOiB0YXJnZXRzLFxuICAgICAgICAgICAgICAgIF9hdHRhY2hlZExpc3RlbmVyczogYXR0YWNoZWRMaXN0ZW5lcnNcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0oKSk7XG5cbiAgICBmdW5jdGlvbiBibGFuayAoKSB7fVxuXG4gICAgZnVuY3Rpb24gaXNFbGVtZW50IChvKSB7XG4gICAgICAgIGlmICghbyB8fCAodHlwZW9mIG8gIT09ICdvYmplY3QnKSkgeyByZXR1cm4gZmFsc2U7IH1cblxuICAgICAgICB2YXIgX3dpbmRvdyA9IGdldFdpbmRvdyhvKSB8fCB3aW5kb3c7XG5cbiAgICAgICAgcmV0dXJuICgvb2JqZWN0fGZ1bmN0aW9uLy50ZXN0KHR5cGVvZiBfd2luZG93LkVsZW1lbnQpXG4gICAgICAgICAgICA/IG8gaW5zdGFuY2VvZiBfd2luZG93LkVsZW1lbnQgLy9ET00yXG4gICAgICAgICAgICA6IG8ubm9kZVR5cGUgPT09IDEgJiYgdHlwZW9mIG8ubm9kZU5hbWUgPT09IFwic3RyaW5nXCIpO1xuICAgIH1cbiAgICBmdW5jdGlvbiBpc1dpbmRvdyAodGhpbmcpIHsgcmV0dXJuIHRoaW5nID09PSB3aW5kb3cgfHwgISEodGhpbmcgJiYgdGhpbmcuV2luZG93KSAmJiAodGhpbmcgaW5zdGFuY2VvZiB0aGluZy5XaW5kb3cpOyB9XG4gICAgZnVuY3Rpb24gaXNEb2NGcmFnICh0aGluZykgeyByZXR1cm4gISF0aGluZyAmJiB0aGluZyBpbnN0YW5jZW9mIERvY3VtZW50RnJhZ21lbnQ7IH1cbiAgICBmdW5jdGlvbiBpc0FycmF5ICh0aGluZykge1xuICAgICAgICByZXR1cm4gaXNPYmplY3QodGhpbmcpXG4gICAgICAgICAgICAgICAgJiYgKHR5cGVvZiB0aGluZy5sZW5ndGggIT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgICAgICAmJiBpc0Z1bmN0aW9uKHRoaW5nLnNwbGljZSk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGlzT2JqZWN0ICAgKHRoaW5nKSB7IHJldHVybiAhIXRoaW5nICYmICh0eXBlb2YgdGhpbmcgPT09ICdvYmplY3QnKTsgfVxuICAgIGZ1bmN0aW9uIGlzRnVuY3Rpb24gKHRoaW5nKSB7IHJldHVybiB0eXBlb2YgdGhpbmcgPT09ICdmdW5jdGlvbic7IH1cbiAgICBmdW5jdGlvbiBpc051bWJlciAgICh0aGluZykgeyByZXR1cm4gdHlwZW9mIHRoaW5nID09PSAnbnVtYmVyJyAgOyB9XG4gICAgZnVuY3Rpb24gaXNCb29sICAgICAodGhpbmcpIHsgcmV0dXJuIHR5cGVvZiB0aGluZyA9PT0gJ2Jvb2xlYW4nIDsgfVxuICAgIGZ1bmN0aW9uIGlzU3RyaW5nICAgKHRoaW5nKSB7IHJldHVybiB0eXBlb2YgdGhpbmcgPT09ICdzdHJpbmcnICA7IH1cblxuICAgIGZ1bmN0aW9uIHRyeVNlbGVjdG9yICh2YWx1ZSkge1xuICAgICAgICBpZiAoIWlzU3RyaW5nKHZhbHVlKSkgeyByZXR1cm4gZmFsc2U7IH1cblxuICAgICAgICAvLyBhbiBleGNlcHRpb24gd2lsbCBiZSByYWlzZWQgaWYgaXQgaXMgaW52YWxpZFxuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZXh0ZW5kIChkZXN0LCBzb3VyY2UpIHtcbiAgICAgICAgZm9yICh2YXIgcHJvcCBpbiBzb3VyY2UpIHtcbiAgICAgICAgICAgIGRlc3RbcHJvcF0gPSBzb3VyY2VbcHJvcF07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGRlc3Q7XG4gICAgfVxuXG4gICAgdmFyIHByZWZpeGVkUHJvcFJFcyA9IHtcbiAgICAgIHdlYmtpdDogLyhNb3ZlbWVudFtYWV18UmFkaXVzW1hZXXxSb3RhdGlvbkFuZ2xlfEZvcmNlKSQvXG4gICAgfTtcblxuICAgIGZ1bmN0aW9uIHBvaW50ZXJFeHRlbmQgKGRlc3QsIHNvdXJjZSkge1xuICAgICAgICBmb3IgKHZhciBwcm9wIGluIHNvdXJjZSkge1xuICAgICAgICAgIHZhciBkZXByZWNhdGVkID0gZmFsc2U7XG5cbiAgICAgICAgICAvLyBza2lwIGRlcHJlY2F0ZWQgcHJlZml4ZWQgcHJvcGVydGllc1xuICAgICAgICAgIGZvciAodmFyIHZlbmRvciBpbiBwcmVmaXhlZFByb3BSRXMpIHtcbiAgICAgICAgICAgIGlmIChwcm9wLmluZGV4T2YodmVuZG9yKSA9PT0gMCAmJiBwcmVmaXhlZFByb3BSRXNbdmVuZG9yXS50ZXN0KHByb3ApKSB7XG4gICAgICAgICAgICAgIGRlcHJlY2F0ZWQgPSB0cnVlO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoIWRlcHJlY2F0ZWQpIHtcbiAgICAgICAgICAgIGRlc3RbcHJvcF0gPSBzb3VyY2VbcHJvcF07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBkZXN0O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNvcHlDb29yZHMgKGRlc3QsIHNyYykge1xuICAgICAgICBkZXN0LnBhZ2UgPSBkZXN0LnBhZ2UgfHwge307XG4gICAgICAgIGRlc3QucGFnZS54ID0gc3JjLnBhZ2UueDtcbiAgICAgICAgZGVzdC5wYWdlLnkgPSBzcmMucGFnZS55O1xuXG4gICAgICAgIGRlc3QuY2xpZW50ID0gZGVzdC5jbGllbnQgfHwge307XG4gICAgICAgIGRlc3QuY2xpZW50LnggPSBzcmMuY2xpZW50Lng7XG4gICAgICAgIGRlc3QuY2xpZW50LnkgPSBzcmMuY2xpZW50Lnk7XG5cbiAgICAgICAgZGVzdC50aW1lU3RhbXAgPSBzcmMudGltZVN0YW1wO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNldEV2ZW50WFkgKHRhcmdldE9iaiwgcG9pbnRlcnMsIGludGVyYWN0aW9uKSB7XG4gICAgICAgIHZhciBwb2ludGVyID0gKHBvaW50ZXJzLmxlbmd0aCA+IDFcbiAgICAgICAgICAgICAgICAgICAgICAgPyBwb2ludGVyQXZlcmFnZShwb2ludGVycylcbiAgICAgICAgICAgICAgICAgICAgICAgOiBwb2ludGVyc1swXSk7XG5cbiAgICAgICAgZ2V0UGFnZVhZKHBvaW50ZXIsIHRtcFhZLCBpbnRlcmFjdGlvbik7XG4gICAgICAgIHRhcmdldE9iai5wYWdlLnggPSB0bXBYWS54O1xuICAgICAgICB0YXJnZXRPYmoucGFnZS55ID0gdG1wWFkueTtcblxuICAgICAgICBnZXRDbGllbnRYWShwb2ludGVyLCB0bXBYWSwgaW50ZXJhY3Rpb24pO1xuICAgICAgICB0YXJnZXRPYmouY2xpZW50LnggPSB0bXBYWS54O1xuICAgICAgICB0YXJnZXRPYmouY2xpZW50LnkgPSB0bXBYWS55O1xuXG4gICAgICAgIHRhcmdldE9iai50aW1lU3RhbXAgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzZXRFdmVudERlbHRhcyAodGFyZ2V0T2JqLCBwcmV2LCBjdXIpIHtcbiAgICAgICAgdGFyZ2V0T2JqLnBhZ2UueCAgICAgPSBjdXIucGFnZS54ICAgICAgLSBwcmV2LnBhZ2UueDtcbiAgICAgICAgdGFyZ2V0T2JqLnBhZ2UueSAgICAgPSBjdXIucGFnZS55ICAgICAgLSBwcmV2LnBhZ2UueTtcbiAgICAgICAgdGFyZ2V0T2JqLmNsaWVudC54ICAgPSBjdXIuY2xpZW50LnggICAgLSBwcmV2LmNsaWVudC54O1xuICAgICAgICB0YXJnZXRPYmouY2xpZW50LnkgICA9IGN1ci5jbGllbnQueSAgICAtIHByZXYuY2xpZW50Lnk7XG4gICAgICAgIHRhcmdldE9iai50aW1lU3RhbXAgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKSAtIHByZXYudGltZVN0YW1wO1xuXG4gICAgICAgIC8vIHNldCBwb2ludGVyIHZlbG9jaXR5XG4gICAgICAgIHZhciBkdCA9IE1hdGgubWF4KHRhcmdldE9iai50aW1lU3RhbXAgLyAxMDAwLCAwLjAwMSk7XG4gICAgICAgIHRhcmdldE9iai5wYWdlLnNwZWVkICAgPSBoeXBvdCh0YXJnZXRPYmoucGFnZS54LCB0YXJnZXRPYmoucGFnZS55KSAvIGR0O1xuICAgICAgICB0YXJnZXRPYmoucGFnZS52eCAgICAgID0gdGFyZ2V0T2JqLnBhZ2UueCAvIGR0O1xuICAgICAgICB0YXJnZXRPYmoucGFnZS52eSAgICAgID0gdGFyZ2V0T2JqLnBhZ2UueSAvIGR0O1xuXG4gICAgICAgIHRhcmdldE9iai5jbGllbnQuc3BlZWQgPSBoeXBvdCh0YXJnZXRPYmouY2xpZW50LngsIHRhcmdldE9iai5wYWdlLnkpIC8gZHQ7XG4gICAgICAgIHRhcmdldE9iai5jbGllbnQudnggICAgPSB0YXJnZXRPYmouY2xpZW50LnggLyBkdDtcbiAgICAgICAgdGFyZ2V0T2JqLmNsaWVudC52eSAgICA9IHRhcmdldE9iai5jbGllbnQueSAvIGR0O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzTmF0aXZlUG9pbnRlciAocG9pbnRlcikge1xuICAgICAgICByZXR1cm4gKHBvaW50ZXIgaW5zdGFuY2VvZiB3aW5kb3cuRXZlbnRcbiAgICAgICAgICAgIHx8IChzdXBwb3J0c1RvdWNoICYmIHdpbmRvdy5Ub3VjaCAmJiBwb2ludGVyIGluc3RhbmNlb2Ygd2luZG93LlRvdWNoKSk7XG4gICAgfVxuXG4gICAgLy8gR2V0IHNwZWNpZmllZCBYL1kgY29vcmRzIGZvciBtb3VzZSBvciBldmVudC50b3VjaGVzWzBdXG4gICAgZnVuY3Rpb24gZ2V0WFkgKHR5cGUsIHBvaW50ZXIsIHh5KSB7XG4gICAgICAgIHh5ID0geHkgfHwge307XG4gICAgICAgIHR5cGUgPSB0eXBlIHx8ICdwYWdlJztcblxuICAgICAgICB4eS54ID0gcG9pbnRlclt0eXBlICsgJ1gnXTtcbiAgICAgICAgeHkueSA9IHBvaW50ZXJbdHlwZSArICdZJ107XG5cbiAgICAgICAgcmV0dXJuIHh5O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldFBhZ2VYWSAocG9pbnRlciwgcGFnZSkge1xuICAgICAgICBwYWdlID0gcGFnZSB8fCB7fTtcblxuICAgICAgICAvLyBPcGVyYSBNb2JpbGUgaGFuZGxlcyB0aGUgdmlld3BvcnQgYW5kIHNjcm9sbGluZyBvZGRseVxuICAgICAgICBpZiAoaXNPcGVyYU1vYmlsZSAmJiBpc05hdGl2ZVBvaW50ZXIocG9pbnRlcikpIHtcbiAgICAgICAgICAgIGdldFhZKCdzY3JlZW4nLCBwb2ludGVyLCBwYWdlKTtcblxuICAgICAgICAgICAgcGFnZS54ICs9IHdpbmRvdy5zY3JvbGxYO1xuICAgICAgICAgICAgcGFnZS55ICs9IHdpbmRvdy5zY3JvbGxZO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgZ2V0WFkoJ3BhZ2UnLCBwb2ludGVyLCBwYWdlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBwYWdlO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldENsaWVudFhZIChwb2ludGVyLCBjbGllbnQpIHtcbiAgICAgICAgY2xpZW50ID0gY2xpZW50IHx8IHt9O1xuXG4gICAgICAgIGlmIChpc09wZXJhTW9iaWxlICYmIGlzTmF0aXZlUG9pbnRlcihwb2ludGVyKSkge1xuICAgICAgICAgICAgLy8gT3BlcmEgTW9iaWxlIGhhbmRsZXMgdGhlIHZpZXdwb3J0IGFuZCBzY3JvbGxpbmcgb2RkbHlcbiAgICAgICAgICAgIGdldFhZKCdzY3JlZW4nLCBwb2ludGVyLCBjbGllbnQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgIGdldFhZKCdjbGllbnQnLCBwb2ludGVyLCBjbGllbnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGNsaWVudDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRTY3JvbGxYWSAod2luKSB7XG4gICAgICAgIHdpbiA9IHdpbiB8fCB3aW5kb3c7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB4OiB3aW4uc2Nyb2xsWCB8fCB3aW4uZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnNjcm9sbExlZnQsXG4gICAgICAgICAgICB5OiB3aW4uc2Nyb2xsWSB8fCB3aW4uZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnNjcm9sbFRvcFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldFBvaW50ZXJJZCAocG9pbnRlcikge1xuICAgICAgICByZXR1cm4gaXNOdW1iZXIocG9pbnRlci5wb2ludGVySWQpPyBwb2ludGVyLnBvaW50ZXJJZCA6IHBvaW50ZXIuaWRlbnRpZmllcjtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRBY3R1YWxFbGVtZW50IChlbGVtZW50KSB7XG4gICAgICAgIHJldHVybiAoZWxlbWVudCBpbnN0YW5jZW9mIFNWR0VsZW1lbnRJbnN0YW5jZVxuICAgICAgICAgICAgPyBlbGVtZW50LmNvcnJlc3BvbmRpbmdVc2VFbGVtZW50XG4gICAgICAgICAgICA6IGVsZW1lbnQpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldFdpbmRvdyAobm9kZSkge1xuICAgICAgICBpZiAoaXNXaW5kb3cobm9kZSkpIHtcbiAgICAgICAgICAgIHJldHVybiBub2RlO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJvb3ROb2RlID0gKG5vZGUub3duZXJEb2N1bWVudCB8fCBub2RlKTtcblxuICAgICAgICByZXR1cm4gcm9vdE5vZGUuZGVmYXVsdFZpZXcgfHwgcm9vdE5vZGUucGFyZW50V2luZG93IHx8IHdpbmRvdztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRFbGVtZW50Q2xpZW50UmVjdCAoZWxlbWVudCkge1xuICAgICAgICB2YXIgY2xpZW50UmVjdCA9IChlbGVtZW50IGluc3RhbmNlb2YgU1ZHRWxlbWVudFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgID8gZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDogZWxlbWVudC5nZXRDbGllbnRSZWN0cygpWzBdKTtcblxuICAgICAgICByZXR1cm4gY2xpZW50UmVjdCAmJiB7XG4gICAgICAgICAgICBsZWZ0ICA6IGNsaWVudFJlY3QubGVmdCxcbiAgICAgICAgICAgIHJpZ2h0IDogY2xpZW50UmVjdC5yaWdodCxcbiAgICAgICAgICAgIHRvcCAgIDogY2xpZW50UmVjdC50b3AsXG4gICAgICAgICAgICBib3R0b206IGNsaWVudFJlY3QuYm90dG9tLFxuICAgICAgICAgICAgd2lkdGggOiBjbGllbnRSZWN0LndpZHRoIHx8IGNsaWVudFJlY3QucmlnaHQgLSBjbGllbnRSZWN0LmxlZnQsXG4gICAgICAgICAgICBoZWlnaHQ6IGNsaWVudFJlY3QuaGVpZ2h0IHx8IGNsaWVudFJlY3QuYm90dG9tIC0gY2xpZW50UmVjdC50b3BcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRFbGVtZW50UmVjdCAoZWxlbWVudCkge1xuICAgICAgICB2YXIgY2xpZW50UmVjdCA9IGdldEVsZW1lbnRDbGllbnRSZWN0KGVsZW1lbnQpO1xuXG4gICAgICAgIGlmICghaXNJT1M3ICYmIGNsaWVudFJlY3QpIHtcbiAgICAgICAgICAgIHZhciBzY3JvbGwgPSBnZXRTY3JvbGxYWShnZXRXaW5kb3coZWxlbWVudCkpO1xuXG4gICAgICAgICAgICBjbGllbnRSZWN0LmxlZnQgICArPSBzY3JvbGwueDtcbiAgICAgICAgICAgIGNsaWVudFJlY3QucmlnaHQgICs9IHNjcm9sbC54O1xuICAgICAgICAgICAgY2xpZW50UmVjdC50b3AgICAgKz0gc2Nyb2xsLnk7XG4gICAgICAgICAgICBjbGllbnRSZWN0LmJvdHRvbSArPSBzY3JvbGwueTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBjbGllbnRSZWN0O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldFRvdWNoUGFpciAoZXZlbnQpIHtcbiAgICAgICAgdmFyIHRvdWNoZXMgPSBbXTtcblxuICAgICAgICAvLyBhcnJheSBvZiB0b3VjaGVzIGlzIHN1cHBsaWVkXG4gICAgICAgIGlmIChpc0FycmF5KGV2ZW50KSkge1xuICAgICAgICAgICAgdG91Y2hlc1swXSA9IGV2ZW50WzBdO1xuICAgICAgICAgICAgdG91Y2hlc1sxXSA9IGV2ZW50WzFdO1xuICAgICAgICB9XG4gICAgICAgIC8vIGFuIGV2ZW50XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaWYgKGV2ZW50LnR5cGUgPT09ICd0b3VjaGVuZCcpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXZlbnQudG91Y2hlcy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgdG91Y2hlc1swXSA9IGV2ZW50LnRvdWNoZXNbMF07XG4gICAgICAgICAgICAgICAgICAgIHRvdWNoZXNbMV0gPSBldmVudC5jaGFuZ2VkVG91Y2hlc1swXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoZXZlbnQudG91Y2hlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdG91Y2hlc1swXSA9IGV2ZW50LmNoYW5nZWRUb3VjaGVzWzBdO1xuICAgICAgICAgICAgICAgICAgICB0b3VjaGVzWzFdID0gZXZlbnQuY2hhbmdlZFRvdWNoZXNbMV07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdG91Y2hlc1swXSA9IGV2ZW50LnRvdWNoZXNbMF07XG4gICAgICAgICAgICAgICAgdG91Y2hlc1sxXSA9IGV2ZW50LnRvdWNoZXNbMV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdG91Y2hlcztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwb2ludGVyQXZlcmFnZSAocG9pbnRlcnMpIHtcbiAgICAgICAgdmFyIGF2ZXJhZ2UgPSB7XG4gICAgICAgICAgICBwYWdlWCAgOiAwLFxuICAgICAgICAgICAgcGFnZVkgIDogMCxcbiAgICAgICAgICAgIGNsaWVudFg6IDAsXG4gICAgICAgICAgICBjbGllbnRZOiAwLFxuICAgICAgICAgICAgc2NyZWVuWDogMCxcbiAgICAgICAgICAgIHNjcmVlblk6IDBcbiAgICAgICAgfTtcbiAgICAgICAgdmFyIHByb3A7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwb2ludGVycy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgZm9yIChwcm9wIGluIGF2ZXJhZ2UpIHtcbiAgICAgICAgICAgICAgICBhdmVyYWdlW3Byb3BdICs9IHBvaW50ZXJzW2ldW3Byb3BdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZvciAocHJvcCBpbiBhdmVyYWdlKSB7XG4gICAgICAgICAgICBhdmVyYWdlW3Byb3BdIC89IHBvaW50ZXJzLmxlbmd0aDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBhdmVyYWdlO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHRvdWNoQkJveCAoZXZlbnQpIHtcbiAgICAgICAgaWYgKCFldmVudC5sZW5ndGggJiYgIShldmVudC50b3VjaGVzICYmIGV2ZW50LnRvdWNoZXMubGVuZ3RoID4gMSkpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciB0b3VjaGVzID0gZ2V0VG91Y2hQYWlyKGV2ZW50KSxcbiAgICAgICAgICAgIG1pblggPSBNYXRoLm1pbih0b3VjaGVzWzBdLnBhZ2VYLCB0b3VjaGVzWzFdLnBhZ2VYKSxcbiAgICAgICAgICAgIG1pblkgPSBNYXRoLm1pbih0b3VjaGVzWzBdLnBhZ2VZLCB0b3VjaGVzWzFdLnBhZ2VZKSxcbiAgICAgICAgICAgIG1heFggPSBNYXRoLm1heCh0b3VjaGVzWzBdLnBhZ2VYLCB0b3VjaGVzWzFdLnBhZ2VYKSxcbiAgICAgICAgICAgIG1heFkgPSBNYXRoLm1heCh0b3VjaGVzWzBdLnBhZ2VZLCB0b3VjaGVzWzFdLnBhZ2VZKTtcblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgeDogbWluWCxcbiAgICAgICAgICAgIHk6IG1pblksXG4gICAgICAgICAgICBsZWZ0OiBtaW5YLFxuICAgICAgICAgICAgdG9wOiBtaW5ZLFxuICAgICAgICAgICAgd2lkdGg6IG1heFggLSBtaW5YLFxuICAgICAgICAgICAgaGVpZ2h0OiBtYXhZIC0gbWluWVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHRvdWNoRGlzdGFuY2UgKGV2ZW50LCBkZWx0YVNvdXJjZSkge1xuICAgICAgICBkZWx0YVNvdXJjZSA9IGRlbHRhU291cmNlIHx8IGRlZmF1bHRPcHRpb25zLmRlbHRhU291cmNlO1xuXG4gICAgICAgIHZhciBzb3VyY2VYID0gZGVsdGFTb3VyY2UgKyAnWCcsXG4gICAgICAgICAgICBzb3VyY2VZID0gZGVsdGFTb3VyY2UgKyAnWScsXG4gICAgICAgICAgICB0b3VjaGVzID0gZ2V0VG91Y2hQYWlyKGV2ZW50KTtcblxuXG4gICAgICAgIHZhciBkeCA9IHRvdWNoZXNbMF1bc291cmNlWF0gLSB0b3VjaGVzWzFdW3NvdXJjZVhdLFxuICAgICAgICAgICAgZHkgPSB0b3VjaGVzWzBdW3NvdXJjZVldIC0gdG91Y2hlc1sxXVtzb3VyY2VZXTtcblxuICAgICAgICByZXR1cm4gaHlwb3QoZHgsIGR5KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB0b3VjaEFuZ2xlIChldmVudCwgcHJldkFuZ2xlLCBkZWx0YVNvdXJjZSkge1xuICAgICAgICBkZWx0YVNvdXJjZSA9IGRlbHRhU291cmNlIHx8IGRlZmF1bHRPcHRpb25zLmRlbHRhU291cmNlO1xuXG4gICAgICAgIHZhciBzb3VyY2VYID0gZGVsdGFTb3VyY2UgKyAnWCcsXG4gICAgICAgICAgICBzb3VyY2VZID0gZGVsdGFTb3VyY2UgKyAnWScsXG4gICAgICAgICAgICB0b3VjaGVzID0gZ2V0VG91Y2hQYWlyKGV2ZW50KSxcbiAgICAgICAgICAgIGR4ID0gdG91Y2hlc1swXVtzb3VyY2VYXSAtIHRvdWNoZXNbMV1bc291cmNlWF0sXG4gICAgICAgICAgICBkeSA9IHRvdWNoZXNbMF1bc291cmNlWV0gLSB0b3VjaGVzWzFdW3NvdXJjZVldLFxuICAgICAgICAgICAgYW5nbGUgPSAxODAgKiBNYXRoLmF0YW4oZHkgLyBkeCkgLyBNYXRoLlBJO1xuXG4gICAgICAgIGlmIChpc051bWJlcihwcmV2QW5nbGUpKSB7XG4gICAgICAgICAgICB2YXIgZHIgPSBhbmdsZSAtIHByZXZBbmdsZSxcbiAgICAgICAgICAgICAgICBkckNsYW1wZWQgPSBkciAlIDM2MDtcblxuICAgICAgICAgICAgaWYgKGRyQ2xhbXBlZCA+IDMxNSkge1xuICAgICAgICAgICAgICAgIGFuZ2xlIC09IDM2MCArIChhbmdsZSAvIDM2MCl8MCAqIDM2MDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGRyQ2xhbXBlZCA+IDEzNSkge1xuICAgICAgICAgICAgICAgIGFuZ2xlIC09IDE4MCArIChhbmdsZSAvIDM2MCl8MCAqIDM2MDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGRyQ2xhbXBlZCA8IC0zMTUpIHtcbiAgICAgICAgICAgICAgICBhbmdsZSArPSAzNjAgKyAoYW5nbGUgLyAzNjApfDAgKiAzNjA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChkckNsYW1wZWQgPCAtMTM1KSB7XG4gICAgICAgICAgICAgICAgYW5nbGUgKz0gMTgwICsgKGFuZ2xlIC8gMzYwKXwwICogMzYwO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuICBhbmdsZTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRPcmlnaW5YWSAoaW50ZXJhY3RhYmxlLCBlbGVtZW50KSB7XG4gICAgICAgIHZhciBvcmlnaW4gPSBpbnRlcmFjdGFibGVcbiAgICAgICAgICAgICAgICA/IGludGVyYWN0YWJsZS5vcHRpb25zLm9yaWdpblxuICAgICAgICAgICAgICAgIDogZGVmYXVsdE9wdGlvbnMub3JpZ2luO1xuXG4gICAgICAgIGlmIChvcmlnaW4gPT09ICdwYXJlbnQnKSB7XG4gICAgICAgICAgICBvcmlnaW4gPSBwYXJlbnRFbGVtZW50KGVsZW1lbnQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKG9yaWdpbiA9PT0gJ3NlbGYnKSB7XG4gICAgICAgICAgICBvcmlnaW4gPSBpbnRlcmFjdGFibGUuZ2V0UmVjdChlbGVtZW50KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0cnlTZWxlY3RvcihvcmlnaW4pKSB7XG4gICAgICAgICAgICBvcmlnaW4gPSBjbG9zZXN0KGVsZW1lbnQsIG9yaWdpbikgfHwgeyB4OiAwLCB5OiAwIH07XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaXNGdW5jdGlvbihvcmlnaW4pKSB7XG4gICAgICAgICAgICBvcmlnaW4gPSBvcmlnaW4oaW50ZXJhY3RhYmxlICYmIGVsZW1lbnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlzRWxlbWVudChvcmlnaW4pKSAge1xuICAgICAgICAgICAgb3JpZ2luID0gZ2V0RWxlbWVudFJlY3Qob3JpZ2luKTtcbiAgICAgICAgfVxuXG4gICAgICAgIG9yaWdpbi54ID0gKCd4JyBpbiBvcmlnaW4pPyBvcmlnaW4ueCA6IG9yaWdpbi5sZWZ0O1xuICAgICAgICBvcmlnaW4ueSA9ICgneScgaW4gb3JpZ2luKT8gb3JpZ2luLnkgOiBvcmlnaW4udG9wO1xuXG4gICAgICAgIHJldHVybiBvcmlnaW47XG4gICAgfVxuXG4gICAgLy8gaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL2EvNTYzNDUyOC8yMjgwODg4XG4gICAgZnVuY3Rpb24gX2dldFFCZXppZXJWYWx1ZSh0LCBwMSwgcDIsIHAzKSB7XG4gICAgICAgIHZhciBpVCA9IDEgLSB0O1xuICAgICAgICByZXR1cm4gaVQgKiBpVCAqIHAxICsgMiAqIGlUICogdCAqIHAyICsgdCAqIHQgKiBwMztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRRdWFkcmF0aWNDdXJ2ZVBvaW50KHN0YXJ0WCwgc3RhcnRZLCBjcFgsIGNwWSwgZW5kWCwgZW5kWSwgcG9zaXRpb24pIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHg6ICBfZ2V0UUJlemllclZhbHVlKHBvc2l0aW9uLCBzdGFydFgsIGNwWCwgZW5kWCksXG4gICAgICAgICAgICB5OiAgX2dldFFCZXppZXJWYWx1ZShwb3NpdGlvbiwgc3RhcnRZLCBjcFksIGVuZFkpXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gaHR0cDovL2dpem1hLmNvbS9lYXNpbmcvXG4gICAgZnVuY3Rpb24gZWFzZU91dFF1YWQgKHQsIGIsIGMsIGQpIHtcbiAgICAgICAgdCAvPSBkO1xuICAgICAgICByZXR1cm4gLWMgKiB0Kih0LTIpICsgYjtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBub2RlQ29udGFpbnMgKHBhcmVudCwgY2hpbGQpIHtcbiAgICAgICAgd2hpbGUgKGNoaWxkKSB7XG4gICAgICAgICAgICBpZiAoY2hpbGQgPT09IHBhcmVudCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjaGlsZCA9IGNoaWxkLnBhcmVudE5vZGU7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY2xvc2VzdCAoY2hpbGQsIHNlbGVjdG9yKSB7XG4gICAgICAgIHZhciBwYXJlbnQgPSBwYXJlbnRFbGVtZW50KGNoaWxkKTtcblxuICAgICAgICB3aGlsZSAoaXNFbGVtZW50KHBhcmVudCkpIHtcbiAgICAgICAgICAgIGlmIChtYXRjaGVzU2VsZWN0b3IocGFyZW50LCBzZWxlY3RvcikpIHsgcmV0dXJuIHBhcmVudDsgfVxuXG4gICAgICAgICAgICBwYXJlbnQgPSBwYXJlbnRFbGVtZW50KHBhcmVudCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwYXJlbnRFbGVtZW50IChub2RlKSB7XG4gICAgICAgIHZhciBwYXJlbnQgPSBub2RlLnBhcmVudE5vZGU7XG5cbiAgICAgICAgaWYgKGlzRG9jRnJhZyhwYXJlbnQpKSB7XG4gICAgICAgICAgICAvLyBza2lwIHBhc3QgI3NoYWRvLXJvb3QgZnJhZ21lbnRzXG4gICAgICAgICAgICB3aGlsZSAoKHBhcmVudCA9IHBhcmVudC5ob3N0KSAmJiBpc0RvY0ZyYWcocGFyZW50KSkge31cblxuICAgICAgICAgICAgcmV0dXJuIHBhcmVudDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBwYXJlbnQ7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaW5Db250ZXh0IChpbnRlcmFjdGFibGUsIGVsZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuIGludGVyYWN0YWJsZS5fY29udGV4dCA9PT0gZWxlbWVudC5vd25lckRvY3VtZW50XG4gICAgICAgICAgICAgICAgfHwgbm9kZUNvbnRhaW5zKGludGVyYWN0YWJsZS5fY29udGV4dCwgZWxlbWVudCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdGVzdElnbm9yZSAoaW50ZXJhY3RhYmxlLCBpbnRlcmFjdGFibGVFbGVtZW50LCBlbGVtZW50KSB7XG4gICAgICAgIHZhciBpZ25vcmVGcm9tID0gaW50ZXJhY3RhYmxlLm9wdGlvbnMuaWdub3JlRnJvbTtcblxuICAgICAgICBpZiAoIWlnbm9yZUZyb20gfHwgIWlzRWxlbWVudChlbGVtZW50KSkgeyByZXR1cm4gZmFsc2U7IH1cblxuICAgICAgICBpZiAoaXNTdHJpbmcoaWdub3JlRnJvbSkpIHtcbiAgICAgICAgICAgIHJldHVybiBtYXRjaGVzVXBUbyhlbGVtZW50LCBpZ25vcmVGcm9tLCBpbnRlcmFjdGFibGVFbGVtZW50KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChpc0VsZW1lbnQoaWdub3JlRnJvbSkpIHtcbiAgICAgICAgICAgIHJldHVybiBub2RlQ29udGFpbnMoaWdub3JlRnJvbSwgZWxlbWVudCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdGVzdEFsbG93IChpbnRlcmFjdGFibGUsIGludGVyYWN0YWJsZUVsZW1lbnQsIGVsZW1lbnQpIHtcbiAgICAgICAgdmFyIGFsbG93RnJvbSA9IGludGVyYWN0YWJsZS5vcHRpb25zLmFsbG93RnJvbTtcblxuICAgICAgICBpZiAoIWFsbG93RnJvbSkgeyByZXR1cm4gdHJ1ZTsgfVxuXG4gICAgICAgIGlmICghaXNFbGVtZW50KGVsZW1lbnQpKSB7IHJldHVybiBmYWxzZTsgfVxuXG4gICAgICAgIGlmIChpc1N0cmluZyhhbGxvd0Zyb20pKSB7XG4gICAgICAgICAgICByZXR1cm4gbWF0Y2hlc1VwVG8oZWxlbWVudCwgYWxsb3dGcm9tLCBpbnRlcmFjdGFibGVFbGVtZW50KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChpc0VsZW1lbnQoYWxsb3dGcm9tKSkge1xuICAgICAgICAgICAgcmV0dXJuIG5vZGVDb250YWlucyhhbGxvd0Zyb20sIGVsZW1lbnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNoZWNrQXhpcyAoYXhpcywgaW50ZXJhY3RhYmxlKSB7XG4gICAgICAgIGlmICghaW50ZXJhY3RhYmxlKSB7IHJldHVybiBmYWxzZTsgfVxuXG4gICAgICAgIHZhciB0aGlzQXhpcyA9IGludGVyYWN0YWJsZS5vcHRpb25zLmRyYWcuYXhpcztcblxuICAgICAgICByZXR1cm4gKGF4aXMgPT09ICd4eScgfHwgdGhpc0F4aXMgPT09ICd4eScgfHwgdGhpc0F4aXMgPT09IGF4aXMpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNoZWNrU25hcCAoaW50ZXJhY3RhYmxlLCBhY3Rpb24pIHtcbiAgICAgICAgdmFyIG9wdGlvbnMgPSBpbnRlcmFjdGFibGUub3B0aW9ucztcblxuICAgICAgICBpZiAoL15yZXNpemUvLnRlc3QoYWN0aW9uKSkge1xuICAgICAgICAgICAgYWN0aW9uID0gJ3Jlc2l6ZSc7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gb3B0aW9uc1thY3Rpb25dLnNuYXAgJiYgb3B0aW9uc1thY3Rpb25dLnNuYXAuZW5hYmxlZDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjaGVja1Jlc3RyaWN0IChpbnRlcmFjdGFibGUsIGFjdGlvbikge1xuICAgICAgICB2YXIgb3B0aW9ucyA9IGludGVyYWN0YWJsZS5vcHRpb25zO1xuXG4gICAgICAgIGlmICgvXnJlc2l6ZS8udGVzdChhY3Rpb24pKSB7XG4gICAgICAgICAgICBhY3Rpb24gPSAncmVzaXplJztcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiAgb3B0aW9uc1thY3Rpb25dLnJlc3RyaWN0ICYmIG9wdGlvbnNbYWN0aW9uXS5yZXN0cmljdC5lbmFibGVkO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNoZWNrQXV0b1Njcm9sbCAoaW50ZXJhY3RhYmxlLCBhY3Rpb24pIHtcbiAgICAgICAgdmFyIG9wdGlvbnMgPSBpbnRlcmFjdGFibGUub3B0aW9ucztcblxuICAgICAgICBpZiAoL15yZXNpemUvLnRlc3QoYWN0aW9uKSkge1xuICAgICAgICAgICAgYWN0aW9uID0gJ3Jlc2l6ZSc7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gIG9wdGlvbnNbYWN0aW9uXS5hdXRvU2Nyb2xsICYmIG9wdGlvbnNbYWN0aW9uXS5hdXRvU2Nyb2xsLmVuYWJsZWQ7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gd2l0aGluSW50ZXJhY3Rpb25MaW1pdCAoaW50ZXJhY3RhYmxlLCBlbGVtZW50LCBhY3Rpb24pIHtcbiAgICAgICAgdmFyIG9wdGlvbnMgPSBpbnRlcmFjdGFibGUub3B0aW9ucyxcbiAgICAgICAgICAgIG1heEFjdGlvbnMgPSBvcHRpb25zW2FjdGlvbi5uYW1lXS5tYXgsXG4gICAgICAgICAgICBtYXhQZXJFbGVtZW50ID0gb3B0aW9uc1thY3Rpb24ubmFtZV0ubWF4UGVyRWxlbWVudCxcbiAgICAgICAgICAgIGFjdGl2ZUludGVyYWN0aW9ucyA9IDAsXG4gICAgICAgICAgICB0YXJnZXRDb3VudCA9IDAsXG4gICAgICAgICAgICB0YXJnZXRFbGVtZW50Q291bnQgPSAwO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBpbnRlcmFjdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBpbnRlcmFjdGlvbiA9IGludGVyYWN0aW9uc1tpXSxcbiAgICAgICAgICAgICAgICBvdGhlckFjdGlvbiA9IGludGVyYWN0aW9uLnByZXBhcmVkLm5hbWUsXG4gICAgICAgICAgICAgICAgYWN0aXZlID0gaW50ZXJhY3Rpb24uaW50ZXJhY3RpbmcoKTtcblxuICAgICAgICAgICAgaWYgKCFhY3RpdmUpIHsgY29udGludWU7IH1cblxuICAgICAgICAgICAgYWN0aXZlSW50ZXJhY3Rpb25zKys7XG5cbiAgICAgICAgICAgIGlmIChhY3RpdmVJbnRlcmFjdGlvbnMgPj0gbWF4SW50ZXJhY3Rpb25zKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoaW50ZXJhY3Rpb24udGFyZ2V0ICE9PSBpbnRlcmFjdGFibGUpIHsgY29udGludWU7IH1cblxuICAgICAgICAgICAgdGFyZ2V0Q291bnQgKz0gKG90aGVyQWN0aW9uID09PSBhY3Rpb24ubmFtZSl8MDtcblxuICAgICAgICAgICAgaWYgKHRhcmdldENvdW50ID49IG1heEFjdGlvbnMpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpbnRlcmFjdGlvbi5lbGVtZW50ID09PSBlbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgdGFyZ2V0RWxlbWVudENvdW50Kys7XG5cbiAgICAgICAgICAgICAgICBpZiAob3RoZXJBY3Rpb24gIT09IGFjdGlvbi5uYW1lIHx8IHRhcmdldEVsZW1lbnRDb3VudCA+PSBtYXhQZXJFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbWF4SW50ZXJhY3Rpb25zID4gMDtcbiAgICB9XG5cbiAgICAvLyBUZXN0IGZvciB0aGUgZWxlbWVudCB0aGF0J3MgXCJhYm92ZVwiIGFsbCBvdGhlciBxdWFsaWZpZXJzXG4gICAgZnVuY3Rpb24gaW5kZXhPZkRlZXBlc3RFbGVtZW50IChlbGVtZW50cykge1xuICAgICAgICB2YXIgZHJvcHpvbmUsXG4gICAgICAgICAgICBkZWVwZXN0Wm9uZSA9IGVsZW1lbnRzWzBdLFxuICAgICAgICAgICAgaW5kZXggPSBkZWVwZXN0Wm9uZT8gMDogLTEsXG4gICAgICAgICAgICBwYXJlbnQsXG4gICAgICAgICAgICBkZWVwZXN0Wm9uZVBhcmVudHMgPSBbXSxcbiAgICAgICAgICAgIGRyb3B6b25lUGFyZW50cyA9IFtdLFxuICAgICAgICAgICAgY2hpbGQsXG4gICAgICAgICAgICBpLFxuICAgICAgICAgICAgbjtcblxuICAgICAgICBmb3IgKGkgPSAxOyBpIDwgZWxlbWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGRyb3B6b25lID0gZWxlbWVudHNbaV07XG5cbiAgICAgICAgICAgIC8vIGFuIGVsZW1lbnQgbWlnaHQgYmVsb25nIHRvIG11bHRpcGxlIHNlbGVjdG9yIGRyb3B6b25lc1xuICAgICAgICAgICAgaWYgKCFkcm9wem9uZSB8fCBkcm9wem9uZSA9PT0gZGVlcGVzdFpvbmUpIHtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCFkZWVwZXN0Wm9uZSkge1xuICAgICAgICAgICAgICAgIGRlZXBlc3Rab25lID0gZHJvcHpvbmU7XG4gICAgICAgICAgICAgICAgaW5kZXggPSBpO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBjaGVjayBpZiB0aGUgZGVlcGVzdCBvciBjdXJyZW50IGFyZSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQgb3IgZG9jdW1lbnQucm9vdEVsZW1lbnRcbiAgICAgICAgICAgIC8vIC0gaWYgdGhlIGN1cnJlbnQgZHJvcHpvbmUgaXMsIGRvIG5vdGhpbmcgYW5kIGNvbnRpbnVlXG4gICAgICAgICAgICBpZiAoZHJvcHpvbmUucGFyZW50Tm9kZSA9PT0gZHJvcHpvbmUub3duZXJEb2N1bWVudCkge1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gLSBpZiBkZWVwZXN0IGlzLCB1cGRhdGUgd2l0aCB0aGUgY3VycmVudCBkcm9wem9uZSBhbmQgY29udGludWUgdG8gbmV4dFxuICAgICAgICAgICAgZWxzZSBpZiAoZGVlcGVzdFpvbmUucGFyZW50Tm9kZSA9PT0gZHJvcHpvbmUub3duZXJEb2N1bWVudCkge1xuICAgICAgICAgICAgICAgIGRlZXBlc3Rab25lID0gZHJvcHpvbmU7XG4gICAgICAgICAgICAgICAgaW5kZXggPSBpO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIWRlZXBlc3Rab25lUGFyZW50cy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBwYXJlbnQgPSBkZWVwZXN0Wm9uZTtcbiAgICAgICAgICAgICAgICB3aGlsZSAocGFyZW50LnBhcmVudE5vZGUgJiYgcGFyZW50LnBhcmVudE5vZGUgIT09IHBhcmVudC5vd25lckRvY3VtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIGRlZXBlc3Rab25lUGFyZW50cy51bnNoaWZ0KHBhcmVudCk7XG4gICAgICAgICAgICAgICAgICAgIHBhcmVudCA9IHBhcmVudC5wYXJlbnROb2RlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gaWYgdGhpcyBlbGVtZW50IGlzIGFuIHN2ZyBlbGVtZW50IGFuZCB0aGUgY3VycmVudCBkZWVwZXN0IGlzXG4gICAgICAgICAgICAvLyBhbiBIVE1MRWxlbWVudFxuICAgICAgICAgICAgaWYgKGRlZXBlc3Rab25lIGluc3RhbmNlb2YgSFRNTEVsZW1lbnRcbiAgICAgICAgICAgICAgICAmJiBkcm9wem9uZSBpbnN0YW5jZW9mIFNWR0VsZW1lbnRcbiAgICAgICAgICAgICAgICAmJiAhKGRyb3B6b25lIGluc3RhbmNlb2YgU1ZHU1ZHRWxlbWVudCkpIHtcblxuICAgICAgICAgICAgICAgIGlmIChkcm9wem9uZSA9PT0gZGVlcGVzdFpvbmUucGFyZW50Tm9kZSkge1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBwYXJlbnQgPSBkcm9wem9uZS5vd25lclNWR0VsZW1lbnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBwYXJlbnQgPSBkcm9wem9uZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZHJvcHpvbmVQYXJlbnRzID0gW107XG5cbiAgICAgICAgICAgIHdoaWxlIChwYXJlbnQucGFyZW50Tm9kZSAhPT0gcGFyZW50Lm93bmVyRG9jdW1lbnQpIHtcbiAgICAgICAgICAgICAgICBkcm9wem9uZVBhcmVudHMudW5zaGlmdChwYXJlbnQpO1xuICAgICAgICAgICAgICAgIHBhcmVudCA9IHBhcmVudC5wYXJlbnROb2RlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBuID0gMDtcblxuICAgICAgICAgICAgLy8gZ2V0IChwb3NpdGlvbiBvZiBsYXN0IGNvbW1vbiBhbmNlc3RvcikgKyAxXG4gICAgICAgICAgICB3aGlsZSAoZHJvcHpvbmVQYXJlbnRzW25dICYmIGRyb3B6b25lUGFyZW50c1tuXSA9PT0gZGVlcGVzdFpvbmVQYXJlbnRzW25dKSB7XG4gICAgICAgICAgICAgICAgbisrO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgcGFyZW50cyA9IFtcbiAgICAgICAgICAgICAgICBkcm9wem9uZVBhcmVudHNbbiAtIDFdLFxuICAgICAgICAgICAgICAgIGRyb3B6b25lUGFyZW50c1tuXSxcbiAgICAgICAgICAgICAgICBkZWVwZXN0Wm9uZVBhcmVudHNbbl1cbiAgICAgICAgICAgIF07XG5cbiAgICAgICAgICAgIGNoaWxkID0gcGFyZW50c1swXS5sYXN0Q2hpbGQ7XG5cbiAgICAgICAgICAgIHdoaWxlIChjaGlsZCkge1xuICAgICAgICAgICAgICAgIGlmIChjaGlsZCA9PT0gcGFyZW50c1sxXSkge1xuICAgICAgICAgICAgICAgICAgICBkZWVwZXN0Wm9uZSA9IGRyb3B6b25lO1xuICAgICAgICAgICAgICAgICAgICBpbmRleCA9IGk7XG4gICAgICAgICAgICAgICAgICAgIGRlZXBlc3Rab25lUGFyZW50cyA9IFtdO1xuXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChjaGlsZCA9PT0gcGFyZW50c1syXSkge1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjaGlsZCA9IGNoaWxkLnByZXZpb3VzU2libGluZztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBpbmRleDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBJbnRlcmFjdGlvbiAoKSB7XG4gICAgICAgIHRoaXMudGFyZ2V0ICAgICAgICAgID0gbnVsbDsgLy8gY3VycmVudCBpbnRlcmFjdGFibGUgYmVpbmcgaW50ZXJhY3RlZCB3aXRoXG4gICAgICAgIHRoaXMuZWxlbWVudCAgICAgICAgID0gbnVsbDsgLy8gdGhlIHRhcmdldCBlbGVtZW50IG9mIHRoZSBpbnRlcmFjdGFibGVcbiAgICAgICAgdGhpcy5kcm9wVGFyZ2V0ICAgICAgPSBudWxsOyAvLyB0aGUgZHJvcHpvbmUgYSBkcmFnIHRhcmdldCBtaWdodCBiZSBkcm9wcGVkIGludG9cbiAgICAgICAgdGhpcy5kcm9wRWxlbWVudCAgICAgPSBudWxsOyAvLyB0aGUgZWxlbWVudCBhdCB0aGUgdGltZSBvZiBjaGVja2luZ1xuICAgICAgICB0aGlzLnByZXZEcm9wVGFyZ2V0ICA9IG51bGw7IC8vIHRoZSBkcm9wem9uZSB0aGF0IHdhcyByZWNlbnRseSBkcmFnZ2VkIGF3YXkgZnJvbVxuICAgICAgICB0aGlzLnByZXZEcm9wRWxlbWVudCA9IG51bGw7IC8vIHRoZSBlbGVtZW50IGF0IHRoZSB0aW1lIG9mIGNoZWNraW5nXG5cbiAgICAgICAgdGhpcy5wcmVwYXJlZCAgICAgICAgPSB7ICAgICAvLyBhY3Rpb24gdGhhdCdzIHJlYWR5IHRvIGJlIGZpcmVkIG9uIG5leHQgbW92ZSBldmVudFxuICAgICAgICAgICAgbmFtZSA6IG51bGwsXG4gICAgICAgICAgICBheGlzIDogbnVsbCxcbiAgICAgICAgICAgIGVkZ2VzOiBudWxsXG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5tYXRjaGVzICAgICAgICAgPSBbXTsgICAvLyBhbGwgc2VsZWN0b3JzIHRoYXQgYXJlIG1hdGNoZWQgYnkgdGFyZ2V0IGVsZW1lbnRcbiAgICAgICAgdGhpcy5tYXRjaEVsZW1lbnRzICAgPSBbXTsgICAvLyBjb3JyZXNwb25kaW5nIGVsZW1lbnRzXG5cbiAgICAgICAgdGhpcy5pbmVydGlhU3RhdHVzID0ge1xuICAgICAgICAgICAgYWN0aXZlICAgICAgIDogZmFsc2UsXG4gICAgICAgICAgICBzbW9vdGhFbmQgICAgOiBmYWxzZSxcbiAgICAgICAgICAgIGVuZGluZyAgICAgICA6IGZhbHNlLFxuXG4gICAgICAgICAgICBzdGFydEV2ZW50OiBudWxsLFxuICAgICAgICAgICAgdXBDb29yZHM6IHt9LFxuXG4gICAgICAgICAgICB4ZTogMCwgeWU6IDAsXG4gICAgICAgICAgICBzeDogMCwgc3k6IDAsXG5cbiAgICAgICAgICAgIHQwOiAwLFxuICAgICAgICAgICAgdngwOiAwLCB2eXM6IDAsXG4gICAgICAgICAgICBkdXJhdGlvbjogMCxcblxuICAgICAgICAgICAgcmVzdW1lRHg6IDAsXG4gICAgICAgICAgICByZXN1bWVEeTogMCxcblxuICAgICAgICAgICAgbGFtYmRhX3YwOiAwLFxuICAgICAgICAgICAgb25lX3ZlX3YwOiAwLFxuICAgICAgICAgICAgaSAgOiBudWxsXG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKGlzRnVuY3Rpb24oRnVuY3Rpb24ucHJvdG90eXBlLmJpbmQpKSB7XG4gICAgICAgICAgICB0aGlzLmJvdW5kSW5lcnRpYUZyYW1lID0gdGhpcy5pbmVydGlhRnJhbWUuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuYm91bmRTbW9vdGhFbmRGcmFtZSA9IHRoaXMuc21vb3RoRW5kRnJhbWUuYmluZCh0aGlzKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciB0aGF0ID0gdGhpcztcblxuICAgICAgICAgICAgdGhpcy5ib3VuZEluZXJ0aWFGcmFtZSA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHRoYXQuaW5lcnRpYUZyYW1lKCk7IH07XG4gICAgICAgICAgICB0aGlzLmJvdW5kU21vb3RoRW5kRnJhbWUgPSBmdW5jdGlvbiAoKSB7IHJldHVybiB0aGF0LnNtb290aEVuZEZyYW1lKCk7IH07XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmFjdGl2ZURyb3BzID0ge1xuICAgICAgICAgICAgZHJvcHpvbmVzOiBbXSwgICAgICAvLyB0aGUgZHJvcHpvbmVzIHRoYXQgYXJlIG1lbnRpb25lZCBiZWxvd1xuICAgICAgICAgICAgZWxlbWVudHMgOiBbXSwgICAgICAvLyBlbGVtZW50cyBvZiBkcm9wem9uZXMgdGhhdCBhY2NlcHQgdGhlIHRhcmdldCBkcmFnZ2FibGVcbiAgICAgICAgICAgIHJlY3RzICAgIDogW10gICAgICAgLy8gdGhlIHJlY3RzIG9mIHRoZSBlbGVtZW50cyBtZW50aW9uZWQgYWJvdmVcbiAgICAgICAgfTtcblxuICAgICAgICAvLyBrZWVwIHRyYWNrIG9mIGFkZGVkIHBvaW50ZXJzXG4gICAgICAgIHRoaXMucG9pbnRlcnMgICAgPSBbXTtcbiAgICAgICAgdGhpcy5wb2ludGVySWRzICA9IFtdO1xuICAgICAgICB0aGlzLmRvd25UYXJnZXRzID0gW107XG4gICAgICAgIHRoaXMuZG93blRpbWVzICAgPSBbXTtcbiAgICAgICAgdGhpcy5ob2xkVGltZXJzICA9IFtdO1xuXG4gICAgICAgIC8vIFByZXZpb3VzIG5hdGl2ZSBwb2ludGVyIG1vdmUgZXZlbnQgY29vcmRpbmF0ZXNcbiAgICAgICAgdGhpcy5wcmV2Q29vcmRzID0ge1xuICAgICAgICAgICAgcGFnZSAgICAgOiB7IHg6IDAsIHk6IDAgfSxcbiAgICAgICAgICAgIGNsaWVudCAgIDogeyB4OiAwLCB5OiAwIH0sXG4gICAgICAgICAgICB0aW1lU3RhbXA6IDBcbiAgICAgICAgfTtcbiAgICAgICAgLy8gY3VycmVudCBuYXRpdmUgcG9pbnRlciBtb3ZlIGV2ZW50IGNvb3JkaW5hdGVzXG4gICAgICAgIHRoaXMuY3VyQ29vcmRzID0ge1xuICAgICAgICAgICAgcGFnZSAgICAgOiB7IHg6IDAsIHk6IDAgfSxcbiAgICAgICAgICAgIGNsaWVudCAgIDogeyB4OiAwLCB5OiAwIH0sXG4gICAgICAgICAgICB0aW1lU3RhbXA6IDBcbiAgICAgICAgfTtcblxuICAgICAgICAvLyBTdGFydGluZyBJbnRlcmFjdEV2ZW50IHBvaW50ZXIgY29vcmRpbmF0ZXNcbiAgICAgICAgdGhpcy5zdGFydENvb3JkcyA9IHtcbiAgICAgICAgICAgIHBhZ2UgICAgIDogeyB4OiAwLCB5OiAwIH0sXG4gICAgICAgICAgICBjbGllbnQgICA6IHsgeDogMCwgeTogMCB9LFxuICAgICAgICAgICAgdGltZVN0YW1wOiAwXG4gICAgICAgIH07XG5cbiAgICAgICAgLy8gQ2hhbmdlIGluIGNvb3JkaW5hdGVzIGFuZCB0aW1lIG9mIHRoZSBwb2ludGVyXG4gICAgICAgIHRoaXMucG9pbnRlckRlbHRhID0ge1xuICAgICAgICAgICAgcGFnZSAgICAgOiB7IHg6IDAsIHk6IDAsIHZ4OiAwLCB2eTogMCwgc3BlZWQ6IDAgfSxcbiAgICAgICAgICAgIGNsaWVudCAgIDogeyB4OiAwLCB5OiAwLCB2eDogMCwgdnk6IDAsIHNwZWVkOiAwIH0sXG4gICAgICAgICAgICB0aW1lU3RhbXA6IDBcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLmRvd25FdmVudCAgID0gbnVsbDsgICAgLy8gcG9pbnRlcmRvd24vbW91c2Vkb3duL3RvdWNoc3RhcnQgZXZlbnRcbiAgICAgICAgdGhpcy5kb3duUG9pbnRlciA9IHt9O1xuXG4gICAgICAgIHRoaXMuX2V2ZW50VGFyZ2V0ICAgID0gbnVsbDtcbiAgICAgICAgdGhpcy5fY3VyRXZlbnRUYXJnZXQgPSBudWxsO1xuXG4gICAgICAgIHRoaXMucHJldkV2ZW50ID0gbnVsbDsgICAgICAvLyBwcmV2aW91cyBhY3Rpb24gZXZlbnRcbiAgICAgICAgdGhpcy50YXBUaW1lICAgPSAwOyAgICAgICAgIC8vIHRpbWUgb2YgdGhlIG1vc3QgcmVjZW50IHRhcCBldmVudFxuICAgICAgICB0aGlzLnByZXZUYXAgICA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5zdGFydE9mZnNldCAgICA9IHsgbGVmdDogMCwgcmlnaHQ6IDAsIHRvcDogMCwgYm90dG9tOiAwIH07XG4gICAgICAgIHRoaXMucmVzdHJpY3RPZmZzZXQgPSB7IGxlZnQ6IDAsIHJpZ2h0OiAwLCB0b3A6IDAsIGJvdHRvbTogMCB9O1xuICAgICAgICB0aGlzLnNuYXBPZmZzZXRzICAgID0gW107XG5cbiAgICAgICAgdGhpcy5nZXN0dXJlID0ge1xuICAgICAgICAgICAgc3RhcnQ6IHsgeDogMCwgeTogMCB9LFxuXG4gICAgICAgICAgICBzdGFydERpc3RhbmNlOiAwLCAgIC8vIGRpc3RhbmNlIGJldHdlZW4gdHdvIHRvdWNoZXMgb2YgdG91Y2hTdGFydFxuICAgICAgICAgICAgcHJldkRpc3RhbmNlIDogMCxcbiAgICAgICAgICAgIGRpc3RhbmNlICAgICA6IDAsXG5cbiAgICAgICAgICAgIHNjYWxlOiAxLCAgICAgICAgICAgLy8gZ2VzdHVyZS5kaXN0YW5jZSAvIGdlc3R1cmUuc3RhcnREaXN0YW5jZVxuXG4gICAgICAgICAgICBzdGFydEFuZ2xlOiAwLCAgICAgIC8vIGFuZ2xlIG9mIGxpbmUgam9pbmluZyB0d28gdG91Y2hlc1xuICAgICAgICAgICAgcHJldkFuZ2xlIDogMCAgICAgICAvLyBhbmdsZSBvZiB0aGUgcHJldmlvdXMgZ2VzdHVyZSBldmVudFxuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMuc25hcFN0YXR1cyA9IHtcbiAgICAgICAgICAgIHggICAgICAgOiAwLCB5ICAgICAgIDogMCxcbiAgICAgICAgICAgIGR4ICAgICAgOiAwLCBkeSAgICAgIDogMCxcbiAgICAgICAgICAgIHJlYWxYICAgOiAwLCByZWFsWSAgIDogMCxcbiAgICAgICAgICAgIHNuYXBwZWRYOiAwLCBzbmFwcGVkWTogMCxcbiAgICAgICAgICAgIHRhcmdldHMgOiBbXSxcbiAgICAgICAgICAgIGxvY2tlZCAgOiBmYWxzZSxcbiAgICAgICAgICAgIGNoYW5nZWQgOiBmYWxzZVxuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMucmVzdHJpY3RTdGF0dXMgPSB7XG4gICAgICAgICAgICBkeCAgICAgICAgIDogMCwgZHkgICAgICAgICA6IDAsXG4gICAgICAgICAgICByZXN0cmljdGVkWDogMCwgcmVzdHJpY3RlZFk6IDAsXG4gICAgICAgICAgICBzbmFwICAgICAgIDogbnVsbCxcbiAgICAgICAgICAgIHJlc3RyaWN0ZWQgOiBmYWxzZSxcbiAgICAgICAgICAgIGNoYW5nZWQgICAgOiBmYWxzZVxuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMucmVzdHJpY3RTdGF0dXMuc25hcCA9IHRoaXMuc25hcFN0YXR1cztcblxuICAgICAgICB0aGlzLnBvaW50ZXJJc0Rvd24gICA9IGZhbHNlO1xuICAgICAgICB0aGlzLnBvaW50ZXJXYXNNb3ZlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLmdlc3R1cmluZyAgICAgICA9IGZhbHNlO1xuICAgICAgICB0aGlzLmRyYWdnaW5nICAgICAgICA9IGZhbHNlO1xuICAgICAgICB0aGlzLnJlc2l6aW5nICAgICAgICA9IGZhbHNlO1xuICAgICAgICB0aGlzLnJlc2l6ZUF4ZXMgICAgICA9ICd4eSc7XG5cbiAgICAgICAgdGhpcy5tb3VzZSA9IGZhbHNlO1xuXG4gICAgICAgIGludGVyYWN0aW9ucy5wdXNoKHRoaXMpO1xuICAgIH1cblxuICAgIEludGVyYWN0aW9uLnByb3RvdHlwZSA9IHtcbiAgICAgICAgZ2V0UGFnZVhZICA6IGZ1bmN0aW9uIChwb2ludGVyLCB4eSkgeyByZXR1cm4gICBnZXRQYWdlWFkocG9pbnRlciwgeHksIHRoaXMpOyB9LFxuICAgICAgICBnZXRDbGllbnRYWTogZnVuY3Rpb24gKHBvaW50ZXIsIHh5KSB7IHJldHVybiBnZXRDbGllbnRYWShwb2ludGVyLCB4eSwgdGhpcyk7IH0sXG4gICAgICAgIHNldEV2ZW50WFkgOiBmdW5jdGlvbiAodGFyZ2V0LCBwdHIpIHsgcmV0dXJuICBzZXRFdmVudFhZKHRhcmdldCwgcHRyLCB0aGlzKTsgfSxcblxuICAgICAgICBwb2ludGVyT3ZlcjogZnVuY3Rpb24gKHBvaW50ZXIsIGV2ZW50LCBldmVudFRhcmdldCkge1xuICAgICAgICAgICAgaWYgKHRoaXMucHJlcGFyZWQubmFtZSB8fCAhdGhpcy5tb3VzZSkgeyByZXR1cm47IH1cblxuICAgICAgICAgICAgdmFyIGN1ck1hdGNoZXMgPSBbXSxcbiAgICAgICAgICAgICAgICBjdXJNYXRjaEVsZW1lbnRzID0gW10sXG4gICAgICAgICAgICAgICAgcHJldlRhcmdldEVsZW1lbnQgPSB0aGlzLmVsZW1lbnQ7XG5cbiAgICAgICAgICAgIHRoaXMuYWRkUG9pbnRlcihwb2ludGVyKTtcblxuICAgICAgICAgICAgaWYgKHRoaXMudGFyZ2V0XG4gICAgICAgICAgICAgICAgJiYgKHRlc3RJZ25vcmUodGhpcy50YXJnZXQsIHRoaXMuZWxlbWVudCwgZXZlbnRUYXJnZXQpXG4gICAgICAgICAgICAgICAgICAgIHx8ICF0ZXN0QWxsb3codGhpcy50YXJnZXQsIHRoaXMuZWxlbWVudCwgZXZlbnRUYXJnZXQpKSkge1xuICAgICAgICAgICAgICAgIC8vIGlmIHRoZSBldmVudFRhcmdldCBzaG91bGQgYmUgaWdub3JlZCBvciBzaG91bGRuJ3QgYmUgYWxsb3dlZFxuICAgICAgICAgICAgICAgIC8vIGNsZWFyIHRoZSBwcmV2aW91cyB0YXJnZXRcbiAgICAgICAgICAgICAgICB0aGlzLnRhcmdldCA9IG51bGw7XG4gICAgICAgICAgICAgICAgdGhpcy5lbGVtZW50ID0gbnVsbDtcbiAgICAgICAgICAgICAgICB0aGlzLm1hdGNoZXMgPSBbXTtcbiAgICAgICAgICAgICAgICB0aGlzLm1hdGNoRWxlbWVudHMgPSBbXTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGVsZW1lbnRJbnRlcmFjdGFibGUgPSBpbnRlcmFjdGFibGVzLmdldChldmVudFRhcmdldCksXG4gICAgICAgICAgICAgICAgZWxlbWVudEFjdGlvbiA9IChlbGVtZW50SW50ZXJhY3RhYmxlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAmJiAhdGVzdElnbm9yZShlbGVtZW50SW50ZXJhY3RhYmxlLCBldmVudFRhcmdldCwgZXZlbnRUYXJnZXQpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAmJiB0ZXN0QWxsb3coZWxlbWVudEludGVyYWN0YWJsZSwgZXZlbnRUYXJnZXQsIGV2ZW50VGFyZ2V0KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJiYgdmFsaWRhdGVBY3Rpb24oXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudEludGVyYWN0YWJsZS5nZXRBY3Rpb24ocG9pbnRlciwgZXZlbnQsIHRoaXMsIGV2ZW50VGFyZ2V0KSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50SW50ZXJhY3RhYmxlKSk7XG5cbiAgICAgICAgICAgIGlmIChlbGVtZW50QWN0aW9uICYmICF3aXRoaW5JbnRlcmFjdGlvbkxpbWl0KGVsZW1lbnRJbnRlcmFjdGFibGUsIGV2ZW50VGFyZ2V0LCBlbGVtZW50QWN0aW9uKSkge1xuICAgICAgICAgICAgICAgICBlbGVtZW50QWN0aW9uID0gbnVsbDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZnVuY3Rpb24gcHVzaEN1ck1hdGNoZXMgKGludGVyYWN0YWJsZSwgc2VsZWN0b3IpIHtcbiAgICAgICAgICAgICAgICBpZiAoaW50ZXJhY3RhYmxlXG4gICAgICAgICAgICAgICAgICAgICYmIGluQ29udGV4dChpbnRlcmFjdGFibGUsIGV2ZW50VGFyZ2V0KVxuICAgICAgICAgICAgICAgICAgICAmJiAhdGVzdElnbm9yZShpbnRlcmFjdGFibGUsIGV2ZW50VGFyZ2V0LCBldmVudFRhcmdldClcbiAgICAgICAgICAgICAgICAgICAgJiYgdGVzdEFsbG93KGludGVyYWN0YWJsZSwgZXZlbnRUYXJnZXQsIGV2ZW50VGFyZ2V0KVxuICAgICAgICAgICAgICAgICAgICAmJiBtYXRjaGVzU2VsZWN0b3IoZXZlbnRUYXJnZXQsIHNlbGVjdG9yKSkge1xuXG4gICAgICAgICAgICAgICAgICAgIGN1ck1hdGNoZXMucHVzaChpbnRlcmFjdGFibGUpO1xuICAgICAgICAgICAgICAgICAgICBjdXJNYXRjaEVsZW1lbnRzLnB1c2goZXZlbnRUYXJnZXQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGVsZW1lbnRBY3Rpb24pIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRhcmdldCA9IGVsZW1lbnRJbnRlcmFjdGFibGU7XG4gICAgICAgICAgICAgICAgdGhpcy5lbGVtZW50ID0gZXZlbnRUYXJnZXQ7XG4gICAgICAgICAgICAgICAgdGhpcy5tYXRjaGVzID0gW107XG4gICAgICAgICAgICAgICAgdGhpcy5tYXRjaEVsZW1lbnRzID0gW107XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBpbnRlcmFjdGFibGVzLmZvckVhY2hTZWxlY3RvcihwdXNoQ3VyTWF0Y2hlcyk7XG5cbiAgICAgICAgICAgICAgICBpZiAodGhpcy52YWxpZGF0ZVNlbGVjdG9yKHBvaW50ZXIsIGV2ZW50LCBjdXJNYXRjaGVzLCBjdXJNYXRjaEVsZW1lbnRzKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLm1hdGNoZXMgPSBjdXJNYXRjaGVzO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLm1hdGNoRWxlbWVudHMgPSBjdXJNYXRjaEVsZW1lbnRzO1xuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucG9pbnRlckhvdmVyKHBvaW50ZXIsIGV2ZW50LCB0aGlzLm1hdGNoZXMsIHRoaXMubWF0Y2hFbGVtZW50cyk7XG4gICAgICAgICAgICAgICAgICAgIGV2ZW50cy5hZGQoZXZlbnRUYXJnZXQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgUG9pbnRlckV2ZW50PyBwRXZlbnRUeXBlcy5tb3ZlIDogJ21vdXNlbW92ZScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXJzLnBvaW50ZXJIb3Zlcik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKHRoaXMudGFyZ2V0KSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChub2RlQ29udGFpbnMocHJldlRhcmdldEVsZW1lbnQsIGV2ZW50VGFyZ2V0KSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wb2ludGVySG92ZXIocG9pbnRlciwgZXZlbnQsIHRoaXMubWF0Y2hlcywgdGhpcy5tYXRjaEVsZW1lbnRzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50cy5hZGQodGhpcy5lbGVtZW50LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBQb2ludGVyRXZlbnQ/IHBFdmVudFR5cGVzLm1vdmUgOiAnbW91c2Vtb3ZlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXJzLnBvaW50ZXJIb3Zlcik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnRhcmdldCA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVsZW1lbnQgPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5tYXRjaGVzID0gW107XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm1hdGNoRWxlbWVudHMgPSBbXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICAvLyBDaGVjayB3aGF0IGFjdGlvbiB3b3VsZCBiZSBwZXJmb3JtZWQgb24gcG9pbnRlck1vdmUgdGFyZ2V0IGlmIGEgbW91c2VcbiAgICAgICAgLy8gYnV0dG9uIHdlcmUgcHJlc3NlZCBhbmQgY2hhbmdlIHRoZSBjdXJzb3IgYWNjb3JkaW5nbHlcbiAgICAgICAgcG9pbnRlckhvdmVyOiBmdW5jdGlvbiAocG9pbnRlciwgZXZlbnQsIGV2ZW50VGFyZ2V0LCBjdXJFdmVudFRhcmdldCwgbWF0Y2hlcywgbWF0Y2hFbGVtZW50cykge1xuICAgICAgICAgICAgdmFyIHRhcmdldCA9IHRoaXMudGFyZ2V0O1xuXG4gICAgICAgICAgICBpZiAoIXRoaXMucHJlcGFyZWQubmFtZSAmJiB0aGlzLm1vdXNlKSB7XG5cbiAgICAgICAgICAgICAgICB2YXIgYWN0aW9uO1xuXG4gICAgICAgICAgICAgICAgLy8gdXBkYXRlIHBvaW50ZXIgY29vcmRzIGZvciBkZWZhdWx0QWN0aW9uQ2hlY2tlciB0byB1c2VcbiAgICAgICAgICAgICAgICB0aGlzLnNldEV2ZW50WFkodGhpcy5jdXJDb29yZHMsIFtwb2ludGVyXSk7XG5cbiAgICAgICAgICAgICAgICBpZiAobWF0Y2hlcykge1xuICAgICAgICAgICAgICAgICAgICBhY3Rpb24gPSB0aGlzLnZhbGlkYXRlU2VsZWN0b3IocG9pbnRlciwgZXZlbnQsIG1hdGNoZXMsIG1hdGNoRWxlbWVudHMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmICh0YXJnZXQpIHtcbiAgICAgICAgICAgICAgICAgICAgYWN0aW9uID0gdmFsaWRhdGVBY3Rpb24odGFyZ2V0LmdldEFjdGlvbih0aGlzLnBvaW50ZXJzWzBdLCBldmVudCwgdGhpcywgdGhpcy5lbGVtZW50KSwgdGhpcy50YXJnZXQpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh0YXJnZXQgJiYgdGFyZ2V0Lm9wdGlvbnMuc3R5bGVDdXJzb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGFjdGlvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Ll9kb2MuZG9jdW1lbnRFbGVtZW50LnN0eWxlLmN1cnNvciA9IGdldEFjdGlvbkN1cnNvcihhY3Rpb24pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Ll9kb2MuZG9jdW1lbnRFbGVtZW50LnN0eWxlLmN1cnNvciA9ICcnO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAodGhpcy5wcmVwYXJlZC5uYW1lKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jaGVja0FuZFByZXZlbnREZWZhdWx0KGV2ZW50LCB0YXJnZXQsIHRoaXMuZWxlbWVudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgcG9pbnRlck91dDogZnVuY3Rpb24gKHBvaW50ZXIsIGV2ZW50LCBldmVudFRhcmdldCkge1xuICAgICAgICAgICAgaWYgKHRoaXMucHJlcGFyZWQubmFtZSkgeyByZXR1cm47IH1cblxuICAgICAgICAgICAgLy8gUmVtb3ZlIHRlbXBvcmFyeSBldmVudCBsaXN0ZW5lcnMgZm9yIHNlbGVjdG9yIEludGVyYWN0YWJsZXNcbiAgICAgICAgICAgIGlmICghaW50ZXJhY3RhYmxlcy5nZXQoZXZlbnRUYXJnZXQpKSB7XG4gICAgICAgICAgICAgICAgZXZlbnRzLnJlbW92ZShldmVudFRhcmdldCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFBvaW50ZXJFdmVudD8gcEV2ZW50VHlwZXMubW92ZSA6ICdtb3VzZW1vdmUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXJzLnBvaW50ZXJIb3Zlcik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0aGlzLnRhcmdldCAmJiB0aGlzLnRhcmdldC5vcHRpb25zLnN0eWxlQ3Vyc29yICYmICF0aGlzLmludGVyYWN0aW5nKCkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRhcmdldC5fZG9jLmRvY3VtZW50RWxlbWVudC5zdHlsZS5jdXJzb3IgPSAnJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBzZWxlY3RvckRvd246IGZ1bmN0aW9uIChwb2ludGVyLCBldmVudCwgZXZlbnRUYXJnZXQsIGN1ckV2ZW50VGFyZ2V0KSB7XG4gICAgICAgICAgICB2YXIgdGhhdCA9IHRoaXMsXG4gICAgICAgICAgICAgICAgLy8gY29weSBldmVudCB0byBiZSB1c2VkIGluIHRpbWVvdXQgZm9yIElFOFxuICAgICAgICAgICAgICAgIGV2ZW50Q29weSA9IGV2ZW50cy51c2VBdHRhY2hFdmVudD8gZXh0ZW5kKHt9LCBldmVudCkgOiBldmVudCxcbiAgICAgICAgICAgICAgICBlbGVtZW50ID0gZXZlbnRUYXJnZXQsXG4gICAgICAgICAgICAgICAgcG9pbnRlckluZGV4ID0gdGhpcy5hZGRQb2ludGVyKHBvaW50ZXIpLFxuICAgICAgICAgICAgICAgIGFjdGlvbjtcblxuICAgICAgICAgICAgdGhpcy5ob2xkVGltZXJzW3BvaW50ZXJJbmRleF0gPSBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICB0aGF0LnBvaW50ZXJIb2xkKGV2ZW50cy51c2VBdHRhY2hFdmVudD8gZXZlbnRDb3B5IDogcG9pbnRlciwgZXZlbnRDb3B5LCBldmVudFRhcmdldCwgY3VyRXZlbnRUYXJnZXQpO1xuICAgICAgICAgICAgfSwgZGVmYXVsdE9wdGlvbnMuX2hvbGREdXJhdGlvbik7XG5cbiAgICAgICAgICAgIHRoaXMucG9pbnRlcklzRG93biA9IHRydWU7XG5cbiAgICAgICAgICAgIC8vIENoZWNrIGlmIHRoZSBkb3duIGV2ZW50IGhpdHMgdGhlIGN1cnJlbnQgaW5lcnRpYSB0YXJnZXRcbiAgICAgICAgICAgIGlmICh0aGlzLmluZXJ0aWFTdGF0dXMuYWN0aXZlICYmIHRoaXMudGFyZ2V0LnNlbGVjdG9yKSB7XG4gICAgICAgICAgICAgICAgLy8gY2xpbWIgdXAgdGhlIERPTSB0cmVlIGZyb20gdGhlIGV2ZW50IHRhcmdldFxuICAgICAgICAgICAgICAgIHdoaWxlIChpc0VsZW1lbnQoZWxlbWVudCkpIHtcblxuICAgICAgICAgICAgICAgICAgICAvLyBpZiB0aGlzIGVsZW1lbnQgaXMgdGhlIGN1cnJlbnQgaW5lcnRpYSB0YXJnZXQgZWxlbWVudFxuICAgICAgICAgICAgICAgICAgICBpZiAoZWxlbWVudCA9PT0gdGhpcy5lbGVtZW50XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBhbmQgdGhlIHByb3NwZWN0aXZlIGFjdGlvbiBpcyB0aGUgc2FtZSBhcyB0aGUgb25nb2luZyBvbmVcbiAgICAgICAgICAgICAgICAgICAgICAgICYmIHZhbGlkYXRlQWN0aW9uKHRoaXMudGFyZ2V0LmdldEFjdGlvbihwb2ludGVyLCBldmVudCwgdGhpcywgdGhpcy5lbGVtZW50KSwgdGhpcy50YXJnZXQpLm5hbWUgPT09IHRoaXMucHJlcGFyZWQubmFtZSkge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBzdG9wIGluZXJ0aWEgc28gdGhhdCB0aGUgbmV4dCBtb3ZlIHdpbGwgYmUgYSBub3JtYWwgb25lXG4gICAgICAgICAgICAgICAgICAgICAgICBjYW5jZWxGcmFtZSh0aGlzLmluZXJ0aWFTdGF0dXMuaSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmluZXJ0aWFTdGF0dXMuYWN0aXZlID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY29sbGVjdEV2ZW50VGFyZ2V0cyhwb2ludGVyLCBldmVudCwgZXZlbnRUYXJnZXQsICdkb3duJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudCA9IHBhcmVudEVsZW1lbnQoZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBkbyBub3RoaW5nIGlmIGludGVyYWN0aW5nXG4gICAgICAgICAgICBpZiAodGhpcy5pbnRlcmFjdGluZygpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jb2xsZWN0RXZlbnRUYXJnZXRzKHBvaW50ZXIsIGV2ZW50LCBldmVudFRhcmdldCwgJ2Rvd24nKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIHB1c2hNYXRjaGVzIChpbnRlcmFjdGFibGUsIHNlbGVjdG9yLCBjb250ZXh0KSB7XG4gICAgICAgICAgICAgICAgdmFyIGVsZW1lbnRzID0gaWU4TWF0Y2hlc1NlbGVjdG9yXG4gICAgICAgICAgICAgICAgICAgID8gY29udGV4dC5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKVxuICAgICAgICAgICAgICAgICAgICA6IHVuZGVmaW5lZDtcblxuICAgICAgICAgICAgICAgIGlmIChpbkNvbnRleHQoaW50ZXJhY3RhYmxlLCBlbGVtZW50KVxuICAgICAgICAgICAgICAgICAgICAmJiAhdGVzdElnbm9yZShpbnRlcmFjdGFibGUsIGVsZW1lbnQsIGV2ZW50VGFyZ2V0KVxuICAgICAgICAgICAgICAgICAgICAmJiB0ZXN0QWxsb3coaW50ZXJhY3RhYmxlLCBlbGVtZW50LCBldmVudFRhcmdldClcbiAgICAgICAgICAgICAgICAgICAgJiYgbWF0Y2hlc1NlbGVjdG9yKGVsZW1lbnQsIHNlbGVjdG9yLCBlbGVtZW50cykpIHtcblxuICAgICAgICAgICAgICAgICAgICB0aGF0Lm1hdGNoZXMucHVzaChpbnRlcmFjdGFibGUpO1xuICAgICAgICAgICAgICAgICAgICB0aGF0Lm1hdGNoRWxlbWVudHMucHVzaChlbGVtZW50KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHVwZGF0ZSBwb2ludGVyIGNvb3JkcyBmb3IgZGVmYXVsdEFjdGlvbkNoZWNrZXIgdG8gdXNlXG4gICAgICAgICAgICB0aGlzLnNldEV2ZW50WFkodGhpcy5jdXJDb29yZHMsIFtwb2ludGVyXSk7XG4gICAgICAgICAgICB0aGlzLmRvd25FdmVudCA9IGV2ZW50O1xuXG4gICAgICAgICAgICB3aGlsZSAoaXNFbGVtZW50KGVsZW1lbnQpICYmICFhY3Rpb24pIHtcbiAgICAgICAgICAgICAgICB0aGlzLm1hdGNoZXMgPSBbXTtcbiAgICAgICAgICAgICAgICB0aGlzLm1hdGNoRWxlbWVudHMgPSBbXTtcblxuICAgICAgICAgICAgICAgIGludGVyYWN0YWJsZXMuZm9yRWFjaFNlbGVjdG9yKHB1c2hNYXRjaGVzKTtcblxuICAgICAgICAgICAgICAgIGFjdGlvbiA9IHRoaXMudmFsaWRhdGVTZWxlY3Rvcihwb2ludGVyLCBldmVudCwgdGhpcy5tYXRjaGVzLCB0aGlzLm1hdGNoRWxlbWVudHMpO1xuICAgICAgICAgICAgICAgIGVsZW1lbnQgPSBwYXJlbnRFbGVtZW50KGVsZW1lbnQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoYWN0aW9uKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5wcmVwYXJlZC5uYW1lICA9IGFjdGlvbi5uYW1lO1xuICAgICAgICAgICAgICAgIHRoaXMucHJlcGFyZWQuYXhpcyAgPSBhY3Rpb24uYXhpcztcbiAgICAgICAgICAgICAgICB0aGlzLnByZXBhcmVkLmVkZ2VzID0gYWN0aW9uLmVkZ2VzO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5jb2xsZWN0RXZlbnRUYXJnZXRzKHBvaW50ZXIsIGV2ZW50LCBldmVudFRhcmdldCwgJ2Rvd24nKTtcblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnBvaW50ZXJEb3duKHBvaW50ZXIsIGV2ZW50LCBldmVudFRhcmdldCwgY3VyRXZlbnRUYXJnZXQsIGFjdGlvbik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBkbyB0aGVzZSBub3cgc2luY2UgcG9pbnRlckRvd24gaXNuJ3QgYmVpbmcgY2FsbGVkIGZyb20gaGVyZVxuICAgICAgICAgICAgICAgIHRoaXMuZG93blRpbWVzW3BvaW50ZXJJbmRleF0gPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmRvd25UYXJnZXRzW3BvaW50ZXJJbmRleF0gPSBldmVudFRhcmdldDtcbiAgICAgICAgICAgICAgICBwb2ludGVyRXh0ZW5kKHRoaXMuZG93blBvaW50ZXIsIHBvaW50ZXIpO1xuXG4gICAgICAgICAgICAgICAgY29weUNvb3Jkcyh0aGlzLnByZXZDb29yZHMsIHRoaXMuY3VyQ29vcmRzKTtcbiAgICAgICAgICAgICAgICB0aGlzLnBvaW50ZXJXYXNNb3ZlZCA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLmNvbGxlY3RFdmVudFRhcmdldHMocG9pbnRlciwgZXZlbnQsIGV2ZW50VGFyZ2V0LCAnZG93bicpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8vIERldGVybWluZSBhY3Rpb24gdG8gYmUgcGVyZm9ybWVkIG9uIG5leHQgcG9pbnRlck1vdmUgYW5kIGFkZCBhcHByb3ByaWF0ZVxuICAgICAgICAvLyBzdHlsZSBhbmQgZXZlbnQgTGlzdGVuZXJzXG4gICAgICAgIHBvaW50ZXJEb3duOiBmdW5jdGlvbiAocG9pbnRlciwgZXZlbnQsIGV2ZW50VGFyZ2V0LCBjdXJFdmVudFRhcmdldCwgZm9yY2VBY3Rpb24pIHtcbiAgICAgICAgICAgIGlmICghZm9yY2VBY3Rpb24gJiYgIXRoaXMuaW5lcnRpYVN0YXR1cy5hY3RpdmUgJiYgdGhpcy5wb2ludGVyV2FzTW92ZWQgJiYgdGhpcy5wcmVwYXJlZC5uYW1lKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jaGVja0FuZFByZXZlbnREZWZhdWx0KGV2ZW50LCB0aGlzLnRhcmdldCwgdGhpcy5lbGVtZW50KTtcblxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5wb2ludGVySXNEb3duID0gdHJ1ZTtcbiAgICAgICAgICAgIHRoaXMuZG93bkV2ZW50ID0gZXZlbnQ7XG5cbiAgICAgICAgICAgIHZhciBwb2ludGVySW5kZXggPSB0aGlzLmFkZFBvaW50ZXIocG9pbnRlciksXG4gICAgICAgICAgICAgICAgYWN0aW9uO1xuXG4gICAgICAgICAgICAvLyBJZiBpdCBpcyB0aGUgc2Vjb25kIHRvdWNoIG9mIGEgbXVsdGktdG91Y2ggZ2VzdHVyZSwga2VlcCB0aGVcbiAgICAgICAgICAgIC8vIHRhcmdldCB0aGUgc2FtZSBhbmQgZ2V0IGEgbmV3IGFjdGlvbiBpZiBhIHRhcmdldCB3YXMgc2V0IGJ5IHRoZVxuICAgICAgICAgICAgLy8gZmlyc3QgdG91Y2hcbiAgICAgICAgICAgIGlmICh0aGlzLnBvaW50ZXJJZHMubGVuZ3RoID4gMSAmJiB0aGlzLnRhcmdldC5fZWxlbWVudCA9PT0gdGhpcy5lbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgdmFyIG5ld0FjdGlvbiA9IHZhbGlkYXRlQWN0aW9uKGZvcmNlQWN0aW9uIHx8IHRoaXMudGFyZ2V0LmdldEFjdGlvbihwb2ludGVyLCBldmVudCwgdGhpcywgdGhpcy5lbGVtZW50KSwgdGhpcy50YXJnZXQpO1xuXG4gICAgICAgICAgICAgICAgaWYgKHdpdGhpbkludGVyYWN0aW9uTGltaXQodGhpcy50YXJnZXQsIHRoaXMuZWxlbWVudCwgbmV3QWN0aW9uKSkge1xuICAgICAgICAgICAgICAgICAgICBhY3Rpb24gPSBuZXdBY3Rpb247XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdGhpcy5wcmVwYXJlZC5uYW1lID0gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIE90aGVyd2lzZSwgc2V0IHRoZSB0YXJnZXQgaWYgdGhlcmUgaXMgbm8gYWN0aW9uIHByZXBhcmVkXG4gICAgICAgICAgICBlbHNlIGlmICghdGhpcy5wcmVwYXJlZC5uYW1lKSB7XG4gICAgICAgICAgICAgICAgdmFyIGludGVyYWN0YWJsZSA9IGludGVyYWN0YWJsZXMuZ2V0KGN1ckV2ZW50VGFyZ2V0KTtcblxuICAgICAgICAgICAgICAgIGlmIChpbnRlcmFjdGFibGVcbiAgICAgICAgICAgICAgICAgICAgJiYgIXRlc3RJZ25vcmUoaW50ZXJhY3RhYmxlLCBjdXJFdmVudFRhcmdldCwgZXZlbnRUYXJnZXQpXG4gICAgICAgICAgICAgICAgICAgICYmIHRlc3RBbGxvdyhpbnRlcmFjdGFibGUsIGN1ckV2ZW50VGFyZ2V0LCBldmVudFRhcmdldClcbiAgICAgICAgICAgICAgICAgICAgJiYgKGFjdGlvbiA9IHZhbGlkYXRlQWN0aW9uKGZvcmNlQWN0aW9uIHx8IGludGVyYWN0YWJsZS5nZXRBY3Rpb24ocG9pbnRlciwgZXZlbnQsIHRoaXMsIGN1ckV2ZW50VGFyZ2V0KSwgaW50ZXJhY3RhYmxlLCBldmVudFRhcmdldCkpXG4gICAgICAgICAgICAgICAgICAgICYmIHdpdGhpbkludGVyYWN0aW9uTGltaXQoaW50ZXJhY3RhYmxlLCBjdXJFdmVudFRhcmdldCwgYWN0aW9uKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnRhcmdldCA9IGludGVyYWN0YWJsZTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbGVtZW50ID0gY3VyRXZlbnRUYXJnZXQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgdGFyZ2V0ID0gdGhpcy50YXJnZXQsXG4gICAgICAgICAgICAgICAgb3B0aW9ucyA9IHRhcmdldCAmJiB0YXJnZXQub3B0aW9ucztcblxuICAgICAgICAgICAgaWYgKHRhcmdldCAmJiAoZm9yY2VBY3Rpb24gfHwgIXRoaXMucHJlcGFyZWQubmFtZSkpIHtcbiAgICAgICAgICAgICAgICBhY3Rpb24gPSBhY3Rpb24gfHwgdmFsaWRhdGVBY3Rpb24oZm9yY2VBY3Rpb24gfHwgdGFyZ2V0LmdldEFjdGlvbihwb2ludGVyLCBldmVudCwgdGhpcywgY3VyRXZlbnRUYXJnZXQpLCB0YXJnZXQsIHRoaXMuZWxlbWVudCk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLnNldEV2ZW50WFkodGhpcy5zdGFydENvb3JkcywgdGhpcy5wb2ludGVycyk7XG5cbiAgICAgICAgICAgICAgICBpZiAoIWFjdGlvbikgeyByZXR1cm47IH1cblxuICAgICAgICAgICAgICAgIGlmIChvcHRpb25zLnN0eWxlQ3Vyc29yKSB7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldC5fZG9jLmRvY3VtZW50RWxlbWVudC5zdHlsZS5jdXJzb3IgPSBnZXRBY3Rpb25DdXJzb3IoYWN0aW9uKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0aGlzLnJlc2l6ZUF4ZXMgPSBhY3Rpb24ubmFtZSA9PT0gJ3Jlc2l6ZSc/IGFjdGlvbi5heGlzIDogbnVsbDtcblxuICAgICAgICAgICAgICAgIGlmIChhY3Rpb24gPT09ICdnZXN0dXJlJyAmJiB0aGlzLnBvaW50ZXJJZHMubGVuZ3RoIDwgMikge1xuICAgICAgICAgICAgICAgICAgICBhY3Rpb24gPSBudWxsO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRoaXMucHJlcGFyZWQubmFtZSAgPSBhY3Rpb24ubmFtZTtcbiAgICAgICAgICAgICAgICB0aGlzLnByZXBhcmVkLmF4aXMgID0gYWN0aW9uLmF4aXM7XG4gICAgICAgICAgICAgICAgdGhpcy5wcmVwYXJlZC5lZGdlcyA9IGFjdGlvbi5lZGdlcztcblxuICAgICAgICAgICAgICAgIHRoaXMuc25hcFN0YXR1cy5zbmFwcGVkWCA9IHRoaXMuc25hcFN0YXR1cy5zbmFwcGVkWSA9XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucmVzdHJpY3RTdGF0dXMucmVzdHJpY3RlZFggPSB0aGlzLnJlc3RyaWN0U3RhdHVzLnJlc3RyaWN0ZWRZID0gTmFOO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5kb3duVGltZXNbcG9pbnRlckluZGV4XSA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgICAgICAgICAgICAgIHRoaXMuZG93blRhcmdldHNbcG9pbnRlckluZGV4XSA9IGV2ZW50VGFyZ2V0O1xuICAgICAgICAgICAgICAgIHBvaW50ZXJFeHRlbmQodGhpcy5kb3duUG9pbnRlciwgcG9pbnRlcik7XG5cbiAgICAgICAgICAgICAgICBjb3B5Q29vcmRzKHRoaXMucHJldkNvb3JkcywgdGhpcy5zdGFydENvb3Jkcyk7XG4gICAgICAgICAgICAgICAgdGhpcy5wb2ludGVyV2FzTW92ZWQgPSBmYWxzZTtcblxuICAgICAgICAgICAgICAgIHRoaXMuY2hlY2tBbmRQcmV2ZW50RGVmYXVsdChldmVudCwgdGFyZ2V0LCB0aGlzLmVsZW1lbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gaWYgaW5lcnRpYSBpcyBhY3RpdmUgdHJ5IHRvIHJlc3VtZSBhY3Rpb25cbiAgICAgICAgICAgIGVsc2UgaWYgKHRoaXMuaW5lcnRpYVN0YXR1cy5hY3RpdmVcbiAgICAgICAgICAgICAgICAmJiBjdXJFdmVudFRhcmdldCA9PT0gdGhpcy5lbGVtZW50XG4gICAgICAgICAgICAgICAgJiYgdmFsaWRhdGVBY3Rpb24odGFyZ2V0LmdldEFjdGlvbihwb2ludGVyLCBldmVudCwgdGhpcywgdGhpcy5lbGVtZW50KSwgdGFyZ2V0KS5uYW1lID09PSB0aGlzLnByZXBhcmVkLm5hbWUpIHtcblxuICAgICAgICAgICAgICAgIGNhbmNlbEZyYW1lKHRoaXMuaW5lcnRpYVN0YXR1cy5pKTtcbiAgICAgICAgICAgICAgICB0aGlzLmluZXJ0aWFTdGF0dXMuYWN0aXZlID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgICB0aGlzLmNoZWNrQW5kUHJldmVudERlZmF1bHQoZXZlbnQsIHRhcmdldCwgdGhpcy5lbGVtZW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBzZXRNb2RpZmljYXRpb25zOiBmdW5jdGlvbiAoY29vcmRzLCBwcmVFbmQpIHtcbiAgICAgICAgICAgIHZhciB0YXJnZXQgICAgICAgICA9IHRoaXMudGFyZ2V0LFxuICAgICAgICAgICAgICAgIHNob3VsZE1vdmUgICAgID0gdHJ1ZSxcbiAgICAgICAgICAgICAgICBzaG91bGRTbmFwICAgICA9IGNoZWNrU25hcCh0YXJnZXQsIHRoaXMucHJlcGFyZWQubmFtZSkgICAgICYmICghdGFyZ2V0Lm9wdGlvbnNbdGhpcy5wcmVwYXJlZC5uYW1lXS5zbmFwLmVuZE9ubHkgICAgIHx8IHByZUVuZCksXG4gICAgICAgICAgICAgICAgc2hvdWxkUmVzdHJpY3QgPSBjaGVja1Jlc3RyaWN0KHRhcmdldCwgdGhpcy5wcmVwYXJlZC5uYW1lKSAmJiAoIXRhcmdldC5vcHRpb25zW3RoaXMucHJlcGFyZWQubmFtZV0ucmVzdHJpY3QuZW5kT25seSB8fCBwcmVFbmQpO1xuXG4gICAgICAgICAgICBpZiAoc2hvdWxkU25hcCAgICApIHsgdGhpcy5zZXRTbmFwcGluZyAgIChjb29yZHMpOyB9IGVsc2UgeyB0aGlzLnNuYXBTdGF0dXMgICAgLmxvY2tlZCAgICAgPSBmYWxzZTsgfVxuICAgICAgICAgICAgaWYgKHNob3VsZFJlc3RyaWN0KSB7IHRoaXMuc2V0UmVzdHJpY3Rpb24oY29vcmRzKTsgfSBlbHNlIHsgdGhpcy5yZXN0cmljdFN0YXR1cy5yZXN0cmljdGVkID0gZmFsc2U7IH1cblxuICAgICAgICAgICAgaWYgKHNob3VsZFNuYXAgJiYgdGhpcy5zbmFwU3RhdHVzLmxvY2tlZCAmJiAhdGhpcy5zbmFwU3RhdHVzLmNoYW5nZWQpIHtcbiAgICAgICAgICAgICAgICBzaG91bGRNb3ZlID0gc2hvdWxkUmVzdHJpY3QgJiYgdGhpcy5yZXN0cmljdFN0YXR1cy5yZXN0cmljdGVkICYmIHRoaXMucmVzdHJpY3RTdGF0dXMuY2hhbmdlZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKHNob3VsZFJlc3RyaWN0ICYmIHRoaXMucmVzdHJpY3RTdGF0dXMucmVzdHJpY3RlZCAmJiAhdGhpcy5yZXN0cmljdFN0YXR1cy5jaGFuZ2VkKSB7XG4gICAgICAgICAgICAgICAgc2hvdWxkTW92ZSA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gc2hvdWxkTW92ZTtcbiAgICAgICAgfSxcblxuICAgICAgICBzZXRTdGFydE9mZnNldHM6IGZ1bmN0aW9uIChhY3Rpb24sIGludGVyYWN0YWJsZSwgZWxlbWVudCkge1xuICAgICAgICAgICAgdmFyIHJlY3QgPSBpbnRlcmFjdGFibGUuZ2V0UmVjdChlbGVtZW50KSxcbiAgICAgICAgICAgICAgICBvcmlnaW4gPSBnZXRPcmlnaW5YWShpbnRlcmFjdGFibGUsIGVsZW1lbnQpLFxuICAgICAgICAgICAgICAgIHNuYXAgPSBpbnRlcmFjdGFibGUub3B0aW9uc1t0aGlzLnByZXBhcmVkLm5hbWVdLnNuYXAsXG4gICAgICAgICAgICAgICAgcmVzdHJpY3QgPSBpbnRlcmFjdGFibGUub3B0aW9uc1t0aGlzLnByZXBhcmVkLm5hbWVdLnJlc3RyaWN0LFxuICAgICAgICAgICAgICAgIHdpZHRoLCBoZWlnaHQ7XG5cbiAgICAgICAgICAgIGlmIChyZWN0KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zdGFydE9mZnNldC5sZWZ0ID0gdGhpcy5zdGFydENvb3Jkcy5wYWdlLnggLSByZWN0LmxlZnQ7XG4gICAgICAgICAgICAgICAgdGhpcy5zdGFydE9mZnNldC50b3AgID0gdGhpcy5zdGFydENvb3Jkcy5wYWdlLnkgLSByZWN0LnRvcDtcblxuICAgICAgICAgICAgICAgIHRoaXMuc3RhcnRPZmZzZXQucmlnaHQgID0gcmVjdC5yaWdodCAgLSB0aGlzLnN0YXJ0Q29vcmRzLnBhZ2UueDtcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXJ0T2Zmc2V0LmJvdHRvbSA9IHJlY3QuYm90dG9tIC0gdGhpcy5zdGFydENvb3Jkcy5wYWdlLnk7XG5cbiAgICAgICAgICAgICAgICBpZiAoJ3dpZHRoJyBpbiByZWN0KSB7IHdpZHRoID0gcmVjdC53aWR0aDsgfVxuICAgICAgICAgICAgICAgIGVsc2UgeyB3aWR0aCA9IHJlY3QucmlnaHQgLSByZWN0LmxlZnQ7IH1cbiAgICAgICAgICAgICAgICBpZiAoJ2hlaWdodCcgaW4gcmVjdCkgeyBoZWlnaHQgPSByZWN0LmhlaWdodDsgfVxuICAgICAgICAgICAgICAgIGVsc2UgeyBoZWlnaHQgPSByZWN0LmJvdHRvbSAtIHJlY3QudG9wOyB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXJ0T2Zmc2V0LmxlZnQgPSB0aGlzLnN0YXJ0T2Zmc2V0LnRvcCA9IHRoaXMuc3RhcnRPZmZzZXQucmlnaHQgPSB0aGlzLnN0YXJ0T2Zmc2V0LmJvdHRvbSA9IDA7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuc25hcE9mZnNldHMuc3BsaWNlKDApO1xuXG4gICAgICAgICAgICB2YXIgc25hcE9mZnNldCA9IHNuYXAgJiYgc25hcC5vZmZzZXQgPT09ICdzdGFydENvb3JkcydcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPyB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB4OiB0aGlzLnN0YXJ0Q29vcmRzLnBhZ2UueCAtIG9yaWdpbi54LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgeTogdGhpcy5zdGFydENvb3Jkcy5wYWdlLnkgLSBvcmlnaW4ueVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDogc25hcCAmJiBzbmFwLm9mZnNldCB8fCB7IHg6IDAsIHk6IDAgfTtcblxuICAgICAgICAgICAgaWYgKHJlY3QgJiYgc25hcCAmJiBzbmFwLnJlbGF0aXZlUG9pbnRzICYmIHNuYXAucmVsYXRpdmVQb2ludHMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzbmFwLnJlbGF0aXZlUG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc25hcE9mZnNldHMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICB4OiB0aGlzLnN0YXJ0T2Zmc2V0LmxlZnQgLSAod2lkdGggICogc25hcC5yZWxhdGl2ZVBvaW50c1tpXS54KSArIHNuYXBPZmZzZXQueCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHk6IHRoaXMuc3RhcnRPZmZzZXQudG9wICAtIChoZWlnaHQgKiBzbmFwLnJlbGF0aXZlUG9pbnRzW2ldLnkpICsgc25hcE9mZnNldC55XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuc25hcE9mZnNldHMucHVzaChzbmFwT2Zmc2V0KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHJlY3QgJiYgcmVzdHJpY3QuZWxlbWVudFJlY3QpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnJlc3RyaWN0T2Zmc2V0LmxlZnQgPSB0aGlzLnN0YXJ0T2Zmc2V0LmxlZnQgLSAod2lkdGggICogcmVzdHJpY3QuZWxlbWVudFJlY3QubGVmdCk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZXN0cmljdE9mZnNldC50b3AgID0gdGhpcy5zdGFydE9mZnNldC50b3AgIC0gKGhlaWdodCAqIHJlc3RyaWN0LmVsZW1lbnRSZWN0LnRvcCk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLnJlc3RyaWN0T2Zmc2V0LnJpZ2h0ICA9IHRoaXMuc3RhcnRPZmZzZXQucmlnaHQgIC0gKHdpZHRoICAqICgxIC0gcmVzdHJpY3QuZWxlbWVudFJlY3QucmlnaHQpKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlc3RyaWN0T2Zmc2V0LmJvdHRvbSA9IHRoaXMuc3RhcnRPZmZzZXQuYm90dG9tIC0gKGhlaWdodCAqICgxIC0gcmVzdHJpY3QuZWxlbWVudFJlY3QuYm90dG9tKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnJlc3RyaWN0T2Zmc2V0LmxlZnQgPSB0aGlzLnJlc3RyaWN0T2Zmc2V0LnRvcCA9IHRoaXMucmVzdHJpY3RPZmZzZXQucmlnaHQgPSB0aGlzLnJlc3RyaWN0T2Zmc2V0LmJvdHRvbSA9IDA7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgLypcXFxuICAgICAgICAgKiBJbnRlcmFjdGlvbi5zdGFydFxuICAgICAgICAgWyBtZXRob2QgXVxuICAgICAgICAgKlxuICAgICAgICAgKiBTdGFydCBhbiBhY3Rpb24gd2l0aCB0aGUgZ2l2ZW4gSW50ZXJhY3RhYmxlIGFuZCBFbGVtZW50IGFzIHRhcnRnZXRzLiBUaGVcbiAgICAgICAgICogYWN0aW9uIG11c3QgYmUgZW5hYmxlZCBmb3IgdGhlIHRhcmdldCBJbnRlcmFjdGFibGUgYW5kIGFuIGFwcHJvcHJpYXRlIG51bWJlclxuICAgICAgICAgKiBvZiBwb2ludGVycyBtdXN0IGJlIGhlbGQgZG93biDigJMgMSBmb3IgZHJhZy9yZXNpemUsIDIgZm9yIGdlc3R1cmUuXG4gICAgICAgICAqXG4gICAgICAgICAqIFVzZSBpdCB3aXRoIGBpbnRlcmFjdGFibGUuPGFjdGlvbj5hYmxlKHsgbWFudWFsU3RhcnQ6IGZhbHNlIH0pYCB0byBhbHdheXNcbiAgICAgICAgICogW3N0YXJ0IGFjdGlvbnMgbWFudWFsbHldKGh0dHBzOi8vZ2l0aHViLmNvbS90YXllL2ludGVyYWN0LmpzL2lzc3Vlcy8xMTQpXG4gICAgICAgICAqXG4gICAgICAgICAtIGFjdGlvbiAgICAgICAob2JqZWN0KSAgVGhlIGFjdGlvbiB0byBiZSBwZXJmb3JtZWQgLSBkcmFnLCByZXNpemUsIGV0Yy5cbiAgICAgICAgIC0gaW50ZXJhY3RhYmxlIChJbnRlcmFjdGFibGUpIFRoZSBJbnRlcmFjdGFibGUgdG8gdGFyZ2V0XG4gICAgICAgICAtIGVsZW1lbnQgICAgICAoRWxlbWVudCkgVGhlIERPTSBFbGVtZW50IHRvIHRhcmdldFxuICAgICAgICAgPSAob2JqZWN0KSBpbnRlcmFjdFxuICAgICAgICAgKipcbiAgICAgICAgIHwgaW50ZXJhY3QodGFyZ2V0KVxuICAgICAgICAgfCAgIC5kcmFnZ2FibGUoe1xuICAgICAgICAgfCAgICAgLy8gZGlzYWJsZSB0aGUgZGVmYXVsdCBkcmFnIHN0YXJ0IGJ5IGRvd24tPm1vdmVcbiAgICAgICAgIHwgICAgIG1hbnVhbFN0YXJ0OiB0cnVlXG4gICAgICAgICB8ICAgfSlcbiAgICAgICAgIHwgICAvLyBzdGFydCBkcmFnZ2luZyBhZnRlciB0aGUgdXNlciBob2xkcyB0aGUgcG9pbnRlciBkb3duXG4gICAgICAgICB8ICAgLm9uKCdob2xkJywgZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICB8ICAgICB2YXIgaW50ZXJhY3Rpb24gPSBldmVudC5pbnRlcmFjdGlvbjtcbiAgICAgICAgIHxcbiAgICAgICAgIHwgICAgIGlmICghaW50ZXJhY3Rpb24uaW50ZXJhY3RpbmcoKSkge1xuICAgICAgICAgfCAgICAgICBpbnRlcmFjdGlvbi5zdGFydCh7IG5hbWU6ICdkcmFnJyB9LFxuICAgICAgICAgfCAgICAgICAgICAgICAgICAgICAgICAgICBldmVudC5pbnRlcmFjdGFibGUsXG4gICAgICAgICB8ICAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50LmN1cnJlbnRUYXJnZXQpO1xuICAgICAgICAgfCAgICAgfVxuICAgICAgICAgfCB9KTtcbiAgICAgICAgXFwqL1xuICAgICAgICBzdGFydDogZnVuY3Rpb24gKGFjdGlvbiwgaW50ZXJhY3RhYmxlLCBlbGVtZW50KSB7XG4gICAgICAgICAgICBpZiAodGhpcy5pbnRlcmFjdGluZygpXG4gICAgICAgICAgICAgICAgfHwgIXRoaXMucG9pbnRlcklzRG93blxuICAgICAgICAgICAgICAgIHx8IHRoaXMucG9pbnRlcklkcy5sZW5ndGggPCAoYWN0aW9uLm5hbWUgPT09ICdnZXN0dXJlJz8gMiA6IDEpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBpZiB0aGlzIGludGVyYWN0aW9uIGhhZCBiZWVuIHJlbW92ZWQgYWZ0ZXIgc3RvcHBpbmdcbiAgICAgICAgICAgIC8vIGFkZCBpdCBiYWNrXG4gICAgICAgICAgICBpZiAoaW5kZXhPZihpbnRlcmFjdGlvbnMsIHRoaXMpID09PSAtMSkge1xuICAgICAgICAgICAgICAgIGludGVyYWN0aW9ucy5wdXNoKHRoaXMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBzZXQgdGhlIHN0YXJ0Q29vcmRzIGlmIHRoZXJlIHdhcyBubyBwcmVwYXJlZCBhY3Rpb25cbiAgICAgICAgICAgIGlmICghdGhpcy5wcmVwYXJlZC5uYW1lKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRFdmVudFhZKHRoaXMuc3RhcnRDb29yZHMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLnByZXBhcmVkLm5hbWUgID0gYWN0aW9uLm5hbWU7XG4gICAgICAgICAgICB0aGlzLnByZXBhcmVkLmF4aXMgID0gYWN0aW9uLmF4aXM7XG4gICAgICAgICAgICB0aGlzLnByZXBhcmVkLmVkZ2VzID0gYWN0aW9uLmVkZ2VzO1xuICAgICAgICAgICAgdGhpcy50YXJnZXQgICAgICAgICA9IGludGVyYWN0YWJsZTtcbiAgICAgICAgICAgIHRoaXMuZWxlbWVudCAgICAgICAgPSBlbGVtZW50O1xuXG4gICAgICAgICAgICB0aGlzLnNldFN0YXJ0T2Zmc2V0cyhhY3Rpb24ubmFtZSwgaW50ZXJhY3RhYmxlLCBlbGVtZW50KTtcbiAgICAgICAgICAgIHRoaXMuc2V0TW9kaWZpY2F0aW9ucyh0aGlzLnN0YXJ0Q29vcmRzLnBhZ2UpO1xuXG4gICAgICAgICAgICB0aGlzLnByZXZFdmVudCA9IHRoaXNbdGhpcy5wcmVwYXJlZC5uYW1lICsgJ1N0YXJ0J10odGhpcy5kb3duRXZlbnQpO1xuICAgICAgICB9LFxuXG4gICAgICAgIHBvaW50ZXJNb3ZlOiBmdW5jdGlvbiAocG9pbnRlciwgZXZlbnQsIGV2ZW50VGFyZ2V0LCBjdXJFdmVudFRhcmdldCwgcHJlRW5kKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5pbmVydGlhU3RhdHVzLmFjdGl2ZSkge1xuICAgICAgICAgICAgICAgIHZhciBwYWdlVXAgICA9IHRoaXMuaW5lcnRpYVN0YXR1cy51cENvb3Jkcy5wYWdlO1xuICAgICAgICAgICAgICAgIHZhciBjbGllbnRVcCA9IHRoaXMuaW5lcnRpYVN0YXR1cy51cENvb3Jkcy5jbGllbnQ7XG5cbiAgICAgICAgICAgICAgICB2YXIgaW5lcnRpYVBvc2l0aW9uID0ge1xuICAgICAgICAgICAgICAgICAgICBwYWdlWCAgOiBwYWdlVXAueCAgICsgdGhpcy5pbmVydGlhU3RhdHVzLnN4LFxuICAgICAgICAgICAgICAgICAgICBwYWdlWSAgOiBwYWdlVXAueSAgICsgdGhpcy5pbmVydGlhU3RhdHVzLnN5LFxuICAgICAgICAgICAgICAgICAgICBjbGllbnRYOiBjbGllbnRVcC54ICsgdGhpcy5pbmVydGlhU3RhdHVzLnN4LFxuICAgICAgICAgICAgICAgICAgICBjbGllbnRZOiBjbGllbnRVcC55ICsgdGhpcy5pbmVydGlhU3RhdHVzLnN5XG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIHRoaXMuc2V0RXZlbnRYWSh0aGlzLmN1ckNvb3JkcywgW2luZXJ0aWFQb3NpdGlvbl0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5yZWNvcmRQb2ludGVyKHBvaW50ZXIpO1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0RXZlbnRYWSh0aGlzLmN1ckNvb3JkcywgdGhpcy5wb2ludGVycyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBkdXBsaWNhdGVNb3ZlID0gKHRoaXMuY3VyQ29vcmRzLnBhZ2UueCA9PT0gdGhpcy5wcmV2Q29vcmRzLnBhZ2UueFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJiYgdGhpcy5jdXJDb29yZHMucGFnZS55ID09PSB0aGlzLnByZXZDb29yZHMucGFnZS55XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAmJiB0aGlzLmN1ckNvb3Jkcy5jbGllbnQueCA9PT0gdGhpcy5wcmV2Q29vcmRzLmNsaWVudC54XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAmJiB0aGlzLmN1ckNvb3Jkcy5jbGllbnQueSA9PT0gdGhpcy5wcmV2Q29vcmRzLmNsaWVudC55KTtcblxuICAgICAgICAgICAgdmFyIGR4LCBkeSxcbiAgICAgICAgICAgICAgICBwb2ludGVySW5kZXggPSB0aGlzLm1vdXNlPyAwIDogaW5kZXhPZih0aGlzLnBvaW50ZXJJZHMsIGdldFBvaW50ZXJJZChwb2ludGVyKSk7XG5cbiAgICAgICAgICAgIC8vIHJlZ2lzdGVyIG1vdmVtZW50IGdyZWF0ZXIgdGhhbiBwb2ludGVyTW92ZVRvbGVyYW5jZVxuICAgICAgICAgICAgaWYgKHRoaXMucG9pbnRlcklzRG93biAmJiAhdGhpcy5wb2ludGVyV2FzTW92ZWQpIHtcbiAgICAgICAgICAgICAgICBkeCA9IHRoaXMuY3VyQ29vcmRzLmNsaWVudC54IC0gdGhpcy5zdGFydENvb3Jkcy5jbGllbnQueDtcbiAgICAgICAgICAgICAgICBkeSA9IHRoaXMuY3VyQ29vcmRzLmNsaWVudC55IC0gdGhpcy5zdGFydENvb3Jkcy5jbGllbnQueTtcblxuICAgICAgICAgICAgICAgIHRoaXMucG9pbnRlcldhc01vdmVkID0gaHlwb3QoZHgsIGR5KSA+IHBvaW50ZXJNb3ZlVG9sZXJhbmNlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIWR1cGxpY2F0ZU1vdmUgJiYgKCF0aGlzLnBvaW50ZXJJc0Rvd24gfHwgdGhpcy5wb2ludGVyV2FzTW92ZWQpKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMucG9pbnRlcklzRG93bikge1xuICAgICAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5ob2xkVGltZXJzW3BvaW50ZXJJbmRleF0pO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRoaXMuY29sbGVjdEV2ZW50VGFyZ2V0cyhwb2ludGVyLCBldmVudCwgZXZlbnRUYXJnZXQsICdtb3ZlJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghdGhpcy5wb2ludGVySXNEb3duKSB7IHJldHVybjsgfVxuXG4gICAgICAgICAgICBpZiAoZHVwbGljYXRlTW92ZSAmJiB0aGlzLnBvaW50ZXJXYXNNb3ZlZCAmJiAhcHJlRW5kKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jaGVja0FuZFByZXZlbnREZWZhdWx0KGV2ZW50LCB0aGlzLnRhcmdldCwgdGhpcy5lbGVtZW50KTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHNldCBwb2ludGVyIGNvb3JkaW5hdGUsIHRpbWUgY2hhbmdlcyBhbmQgc3BlZWRzXG4gICAgICAgICAgICBzZXRFdmVudERlbHRhcyh0aGlzLnBvaW50ZXJEZWx0YSwgdGhpcy5wcmV2Q29vcmRzLCB0aGlzLmN1ckNvb3Jkcyk7XG5cbiAgICAgICAgICAgIGlmICghdGhpcy5wcmVwYXJlZC5uYW1lKSB7IHJldHVybjsgfVxuXG4gICAgICAgICAgICBpZiAodGhpcy5wb2ludGVyV2FzTW92ZWRcbiAgICAgICAgICAgICAgICAvLyBpZ25vcmUgbW92ZW1lbnQgd2hpbGUgaW5lcnRpYSBpcyBhY3RpdmVcbiAgICAgICAgICAgICAgICAmJiAoIXRoaXMuaW5lcnRpYVN0YXR1cy5hY3RpdmUgfHwgKHBvaW50ZXIgaW5zdGFuY2VvZiBJbnRlcmFjdEV2ZW50ICYmIC9pbmVydGlhc3RhcnQvLnRlc3QocG9pbnRlci50eXBlKSkpKSB7XG5cbiAgICAgICAgICAgICAgICAvLyBpZiBqdXN0IHN0YXJ0aW5nIGFuIGFjdGlvbiwgY2FsY3VsYXRlIHRoZSBwb2ludGVyIHNwZWVkIG5vd1xuICAgICAgICAgICAgICAgIGlmICghdGhpcy5pbnRlcmFjdGluZygpKSB7XG4gICAgICAgICAgICAgICAgICAgIHNldEV2ZW50RGVsdGFzKHRoaXMucG9pbnRlckRlbHRhLCB0aGlzLnByZXZDb29yZHMsIHRoaXMuY3VyQ29vcmRzKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBjaGVjayBpZiBhIGRyYWcgaXMgaW4gdGhlIGNvcnJlY3QgYXhpc1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5wcmVwYXJlZC5uYW1lID09PSAnZHJhZycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBhYnNYID0gTWF0aC5hYnMoZHgpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFic1kgPSBNYXRoLmFicyhkeSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0QXhpcyA9IHRoaXMudGFyZ2V0Lm9wdGlvbnMuZHJhZy5heGlzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF4aXMgPSAoYWJzWCA+IGFic1kgPyAneCcgOiBhYnNYIDwgYWJzWSA/ICd5JyA6ICd4eScpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiB0aGUgbW92ZW1lbnQgaXNuJ3QgaW4gdGhlIGF4aXMgb2YgdGhlIGludGVyYWN0YWJsZVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGF4aXMgIT09ICd4eScgJiYgdGFyZ2V0QXhpcyAhPT0gJ3h5JyAmJiB0YXJnZXRBeGlzICE9PSBheGlzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gY2FuY2VsIHRoZSBwcmVwYXJlZCBhY3Rpb25cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnByZXBhcmVkLm5hbWUgPSBudWxsO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGhlbiB0cnkgdG8gZ2V0IGEgZHJhZyBmcm9tIGFub3RoZXIgaW5lcmFjdGFibGVcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBlbGVtZW50ID0gZXZlbnRUYXJnZXQ7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBjaGVjayBlbGVtZW50IGludGVyYWN0YWJsZXNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aGlsZSAoaXNFbGVtZW50KGVsZW1lbnQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBlbGVtZW50SW50ZXJhY3RhYmxlID0gaW50ZXJhY3RhYmxlcy5nZXQoZWxlbWVudCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGVsZW1lbnRJbnRlcmFjdGFibGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICYmIGVsZW1lbnRJbnRlcmFjdGFibGUgIT09IHRoaXMudGFyZ2V0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAmJiAhZWxlbWVudEludGVyYWN0YWJsZS5vcHRpb25zLmRyYWcubWFudWFsU3RhcnRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICYmIGVsZW1lbnRJbnRlcmFjdGFibGUuZ2V0QWN0aW9uKHRoaXMuZG93blBvaW50ZXIsIHRoaXMuZG93bkV2ZW50LCB0aGlzLCBlbGVtZW50KS5uYW1lID09PSAnZHJhZydcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICYmIGNoZWNrQXhpcyhheGlzLCBlbGVtZW50SW50ZXJhY3RhYmxlKSkge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnByZXBhcmVkLm5hbWUgPSAnZHJhZyc7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnRhcmdldCA9IGVsZW1lbnRJbnRlcmFjdGFibGU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVsZW1lbnQgPSBlbGVtZW50O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50ID0gcGFyZW50RWxlbWVudChlbGVtZW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiB0aGVyZSdzIG5vIGRyYWcgZnJvbSBlbGVtZW50IGludGVyYWN0YWJsZXMsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gY2hlY2sgdGhlIHNlbGVjdG9yIGludGVyYWN0YWJsZXNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXRoaXMucHJlcGFyZWQubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgdGhpc0ludGVyYWN0aW9uID0gdGhpcztcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgZ2V0RHJhZ2dhYmxlID0gZnVuY3Rpb24gKGludGVyYWN0YWJsZSwgc2VsZWN0b3IsIGNvbnRleHQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBlbGVtZW50cyA9IGllOE1hdGNoZXNTZWxlY3RvclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgID8gY29udGV4dC5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDogdW5kZWZpbmVkO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaW50ZXJhY3RhYmxlID09PSB0aGlzSW50ZXJhY3Rpb24udGFyZ2V0KSB7IHJldHVybjsgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaW5Db250ZXh0KGludGVyYWN0YWJsZSwgZXZlbnRUYXJnZXQpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJiYgIWludGVyYWN0YWJsZS5vcHRpb25zLmRyYWcubWFudWFsU3RhcnRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAmJiAhdGVzdElnbm9yZShpbnRlcmFjdGFibGUsIGVsZW1lbnQsIGV2ZW50VGFyZ2V0KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICYmIHRlc3RBbGxvdyhpbnRlcmFjdGFibGUsIGVsZW1lbnQsIGV2ZW50VGFyZ2V0KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICYmIG1hdGNoZXNTZWxlY3RvcihlbGVtZW50LCBzZWxlY3RvciwgZWxlbWVudHMpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJiYgaW50ZXJhY3RhYmxlLmdldEFjdGlvbih0aGlzSW50ZXJhY3Rpb24uZG93blBvaW50ZXIsIHRoaXNJbnRlcmFjdGlvbi5kb3duRXZlbnQsIHRoaXNJbnRlcmFjdGlvbiwgZWxlbWVudCkubmFtZSA9PT0gJ2RyYWcnXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJiYgY2hlY2tBeGlzKGF4aXMsIGludGVyYWN0YWJsZSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAmJiB3aXRoaW5JbnRlcmFjdGlvbkxpbWl0KGludGVyYWN0YWJsZSwgZWxlbWVudCwgJ2RyYWcnKSkge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGludGVyYWN0YWJsZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50ID0gZXZlbnRUYXJnZXQ7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgd2hpbGUgKGlzRWxlbWVudChlbGVtZW50KSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHNlbGVjdG9ySW50ZXJhY3RhYmxlID0gaW50ZXJhY3RhYmxlcy5mb3JFYWNoU2VsZWN0b3IoZ2V0RHJhZ2dhYmxlKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHNlbGVjdG9ySW50ZXJhY3RhYmxlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wcmVwYXJlZC5uYW1lID0gJ2RyYWcnO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudGFyZ2V0ID0gc2VsZWN0b3JJbnRlcmFjdGFibGU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbGVtZW50ID0gZWxlbWVudDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudCA9IHBhcmVudEVsZW1lbnQoZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB2YXIgc3RhcnRpbmcgPSAhIXRoaXMucHJlcGFyZWQubmFtZSAmJiAhdGhpcy5pbnRlcmFjdGluZygpO1xuXG4gICAgICAgICAgICAgICAgaWYgKHN0YXJ0aW5nXG4gICAgICAgICAgICAgICAgICAgICYmICh0aGlzLnRhcmdldC5vcHRpb25zW3RoaXMucHJlcGFyZWQubmFtZV0ubWFudWFsU3RhcnRcbiAgICAgICAgICAgICAgICAgICAgICAgIHx8ICF3aXRoaW5JbnRlcmFjdGlvbkxpbWl0KHRoaXMudGFyZ2V0LCB0aGlzLmVsZW1lbnQsIHRoaXMucHJlcGFyZWQpKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnN0b3AoZXZlbnQpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMucHJlcGFyZWQubmFtZSAmJiB0aGlzLnRhcmdldCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhcnRpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc3RhcnQodGhpcy5wcmVwYXJlZCwgdGhpcy50YXJnZXQsIHRoaXMuZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICB2YXIgc2hvdWxkTW92ZSA9IHRoaXMuc2V0TW9kaWZpY2F0aW9ucyh0aGlzLmN1ckNvb3Jkcy5wYWdlLCBwcmVFbmQpO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIG1vdmUgaWYgc25hcHBpbmcgb3IgcmVzdHJpY3Rpb24gZG9lc24ndCBwcmV2ZW50IGl0XG4gICAgICAgICAgICAgICAgICAgIGlmIChzaG91bGRNb3ZlIHx8IHN0YXJ0aW5nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnByZXZFdmVudCA9IHRoaXNbdGhpcy5wcmVwYXJlZC5uYW1lICsgJ01vdmUnXShldmVudCk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNoZWNrQW5kUHJldmVudERlZmF1bHQoZXZlbnQsIHRoaXMudGFyZ2V0LCB0aGlzLmVsZW1lbnQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29weUNvb3Jkcyh0aGlzLnByZXZDb29yZHMsIHRoaXMuY3VyQ29vcmRzKTtcblxuICAgICAgICAgICAgaWYgKHRoaXMuZHJhZ2dpbmcgfHwgdGhpcy5yZXNpemluZykge1xuICAgICAgICAgICAgICAgIHRoaXMuYXV0b1Njcm9sbE1vdmUocG9pbnRlcik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgZHJhZ1N0YXJ0OiBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgIHZhciBkcmFnRXZlbnQgPSBuZXcgSW50ZXJhY3RFdmVudCh0aGlzLCBldmVudCwgJ2RyYWcnLCAnc3RhcnQnLCB0aGlzLmVsZW1lbnQpO1xuXG4gICAgICAgICAgICB0aGlzLmRyYWdnaW5nID0gdHJ1ZTtcbiAgICAgICAgICAgIHRoaXMudGFyZ2V0LmZpcmUoZHJhZ0V2ZW50KTtcblxuICAgICAgICAgICAgLy8gcmVzZXQgYWN0aXZlIGRyb3B6b25lc1xuICAgICAgICAgICAgdGhpcy5hY3RpdmVEcm9wcy5kcm9wem9uZXMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlRHJvcHMuZWxlbWVudHMgID0gW107XG4gICAgICAgICAgICB0aGlzLmFjdGl2ZURyb3BzLnJlY3RzICAgICA9IFtdO1xuXG4gICAgICAgICAgICBpZiAoIXRoaXMuZHluYW1pY0Ryb3ApIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNldEFjdGl2ZURyb3BzKHRoaXMuZWxlbWVudCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBkcm9wRXZlbnRzID0gdGhpcy5nZXREcm9wRXZlbnRzKGV2ZW50LCBkcmFnRXZlbnQpO1xuXG4gICAgICAgICAgICBpZiAoZHJvcEV2ZW50cy5hY3RpdmF0ZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuZmlyZUFjdGl2ZURyb3BzKGRyb3BFdmVudHMuYWN0aXZhdGUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gZHJhZ0V2ZW50O1xuICAgICAgICB9LFxuXG4gICAgICAgIGRyYWdNb3ZlOiBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgIHZhciB0YXJnZXQgPSB0aGlzLnRhcmdldCxcbiAgICAgICAgICAgICAgICBkcmFnRXZlbnQgID0gbmV3IEludGVyYWN0RXZlbnQodGhpcywgZXZlbnQsICdkcmFnJywgJ21vdmUnLCB0aGlzLmVsZW1lbnQpLFxuICAgICAgICAgICAgICAgIGRyYWdnYWJsZUVsZW1lbnQgPSB0aGlzLmVsZW1lbnQsXG4gICAgICAgICAgICAgICAgZHJvcCA9IHRoaXMuZ2V0RHJvcChkcmFnRXZlbnQsIGV2ZW50LCBkcmFnZ2FibGVFbGVtZW50KTtcblxuICAgICAgICAgICAgdGhpcy5kcm9wVGFyZ2V0ID0gZHJvcC5kcm9wem9uZTtcbiAgICAgICAgICAgIHRoaXMuZHJvcEVsZW1lbnQgPSBkcm9wLmVsZW1lbnQ7XG5cbiAgICAgICAgICAgIHZhciBkcm9wRXZlbnRzID0gdGhpcy5nZXREcm9wRXZlbnRzKGV2ZW50LCBkcmFnRXZlbnQpO1xuXG4gICAgICAgICAgICB0YXJnZXQuZmlyZShkcmFnRXZlbnQpO1xuXG4gICAgICAgICAgICBpZiAoZHJvcEV2ZW50cy5sZWF2ZSkgeyB0aGlzLnByZXZEcm9wVGFyZ2V0LmZpcmUoZHJvcEV2ZW50cy5sZWF2ZSk7IH1cbiAgICAgICAgICAgIGlmIChkcm9wRXZlbnRzLmVudGVyKSB7ICAgICB0aGlzLmRyb3BUYXJnZXQuZmlyZShkcm9wRXZlbnRzLmVudGVyKTsgfVxuICAgICAgICAgICAgaWYgKGRyb3BFdmVudHMubW92ZSApIHsgICAgIHRoaXMuZHJvcFRhcmdldC5maXJlKGRyb3BFdmVudHMubW92ZSApOyB9XG5cbiAgICAgICAgICAgIHRoaXMucHJldkRyb3BUYXJnZXQgID0gdGhpcy5kcm9wVGFyZ2V0O1xuICAgICAgICAgICAgdGhpcy5wcmV2RHJvcEVsZW1lbnQgPSB0aGlzLmRyb3BFbGVtZW50O1xuXG4gICAgICAgICAgICByZXR1cm4gZHJhZ0V2ZW50O1xuICAgICAgICB9LFxuXG4gICAgICAgIHJlc2l6ZVN0YXJ0OiBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgIHZhciByZXNpemVFdmVudCA9IG5ldyBJbnRlcmFjdEV2ZW50KHRoaXMsIGV2ZW50LCAncmVzaXplJywgJ3N0YXJ0JywgdGhpcy5lbGVtZW50KTtcblxuICAgICAgICAgICAgaWYgKHRoaXMucHJlcGFyZWQuZWRnZXMpIHtcbiAgICAgICAgICAgICAgICB2YXIgc3RhcnRSZWN0ID0gdGhpcy50YXJnZXQuZ2V0UmVjdCh0aGlzLmVsZW1lbnQpO1xuXG4gICAgICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAgICAgKiBXaGVuIHVzaW5nIHRoZSBgcmVzaXphYmxlLnNxdWFyZWAgb3IgYHJlc2l6YWJsZS5wcmVzZXJ2ZUFzcGVjdFJhdGlvYCBvcHRpb25zLCByZXNpemluZyBmcm9tIG9uZSBlZGdlXG4gICAgICAgICAgICAgICAgICogd2lsbCBhZmZlY3QgYW5vdGhlci4gRS5nLiB3aXRoIGByZXNpemFibGUuc3F1YXJlYCwgcmVzaXppbmcgdG8gbWFrZSB0aGUgcmlnaHQgZWRnZSBsYXJnZXIgd2lsbCBtYWtlXG4gICAgICAgICAgICAgICAgICogdGhlIGJvdHRvbSBlZGdlIGxhcmdlciBieSB0aGUgc2FtZSBhbW91bnQuIFdlIGNhbGwgdGhlc2UgJ2xpbmtlZCcgZWRnZXMuIEFueSBsaW5rZWQgZWRnZXMgd2lsbCBkZXBlbmRcbiAgICAgICAgICAgICAgICAgKiBvbiB0aGUgYWN0aXZlIGVkZ2VzIGFuZCB0aGUgZWRnZSBiZWluZyBpbnRlcmFjdGVkIHdpdGguXG4gICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMudGFyZ2V0Lm9wdGlvbnMucmVzaXplLnNxdWFyZSB8fCB0aGlzLnRhcmdldC5vcHRpb25zLnJlc2l6ZS5wcmVzZXJ2ZUFzcGVjdFJhdGlvKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBsaW5rZWRFZGdlcyA9IGV4dGVuZCh7fSwgdGhpcy5wcmVwYXJlZC5lZGdlcyk7XG5cbiAgICAgICAgICAgICAgICAgICAgbGlua2VkRWRnZXMudG9wICAgID0gbGlua2VkRWRnZXMudG9wICAgIHx8IChsaW5rZWRFZGdlcy5sZWZ0ICAgJiYgIWxpbmtlZEVkZ2VzLmJvdHRvbSk7XG4gICAgICAgICAgICAgICAgICAgIGxpbmtlZEVkZ2VzLmxlZnQgICA9IGxpbmtlZEVkZ2VzLmxlZnQgICB8fCAobGlua2VkRWRnZXMudG9wICAgICYmICFsaW5rZWRFZGdlcy5yaWdodCApO1xuICAgICAgICAgICAgICAgICAgICBsaW5rZWRFZGdlcy5ib3R0b20gPSBsaW5rZWRFZGdlcy5ib3R0b20gfHwgKGxpbmtlZEVkZ2VzLnJpZ2h0ICAmJiAhbGlua2VkRWRnZXMudG9wICAgKTtcbiAgICAgICAgICAgICAgICAgICAgbGlua2VkRWRnZXMucmlnaHQgID0gbGlua2VkRWRnZXMucmlnaHQgIHx8IChsaW5rZWRFZGdlcy5ib3R0b20gJiYgIWxpbmtlZEVkZ2VzLmxlZnQgICk7XG5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wcmVwYXJlZC5fbGlua2VkRWRnZXMgPSBsaW5rZWRFZGdlcztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucHJlcGFyZWQuX2xpbmtlZEVkZ2VzID0gbnVsbDtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBpZiB1c2luZyBgcmVzaXphYmxlLnByZXNlcnZlQXNwZWN0UmF0aW9gIG9wdGlvbiwgcmVjb3JkIGFzcGVjdCByYXRpbyBhdCB0aGUgc3RhcnQgb2YgdGhlIHJlc2l6ZVxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnRhcmdldC5vcHRpb25zLnJlc2l6ZS5wcmVzZXJ2ZUFzcGVjdFJhdGlvKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucmVzaXplU3RhcnRBc3BlY3RSYXRpbyA9IHN0YXJ0UmVjdC53aWR0aCAvIHN0YXJ0UmVjdC5oZWlnaHQ7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdGhpcy5yZXNpemVSZWN0cyA9IHtcbiAgICAgICAgICAgICAgICAgICAgc3RhcnQgICAgIDogc3RhcnRSZWN0LFxuICAgICAgICAgICAgICAgICAgICBjdXJyZW50ICAgOiBleHRlbmQoe30sIHN0YXJ0UmVjdCksXG4gICAgICAgICAgICAgICAgICAgIHJlc3RyaWN0ZWQ6IGV4dGVuZCh7fSwgc3RhcnRSZWN0KSxcbiAgICAgICAgICAgICAgICAgICAgcHJldmlvdXMgIDogZXh0ZW5kKHt9LCBzdGFydFJlY3QpLFxuICAgICAgICAgICAgICAgICAgICBkZWx0YSAgICAgOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBsZWZ0OiAwLCByaWdodCA6IDAsIHdpZHRoIDogMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRvcCA6IDAsIGJvdHRvbTogMCwgaGVpZ2h0OiAwXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgcmVzaXplRXZlbnQucmVjdCA9IHRoaXMucmVzaXplUmVjdHMucmVzdHJpY3RlZDtcbiAgICAgICAgICAgICAgICByZXNpemVFdmVudC5kZWx0YVJlY3QgPSB0aGlzLnJlc2l6ZVJlY3RzLmRlbHRhO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLnRhcmdldC5maXJlKHJlc2l6ZUV2ZW50KTtcblxuICAgICAgICAgICAgdGhpcy5yZXNpemluZyA9IHRydWU7XG5cbiAgICAgICAgICAgIHJldHVybiByZXNpemVFdmVudDtcbiAgICAgICAgfSxcblxuICAgICAgICByZXNpemVNb3ZlOiBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgIHZhciByZXNpemVFdmVudCA9IG5ldyBJbnRlcmFjdEV2ZW50KHRoaXMsIGV2ZW50LCAncmVzaXplJywgJ21vdmUnLCB0aGlzLmVsZW1lbnQpO1xuXG4gICAgICAgICAgICB2YXIgZWRnZXMgPSB0aGlzLnByZXBhcmVkLmVkZ2VzLFxuICAgICAgICAgICAgICAgIGludmVydCA9IHRoaXMudGFyZ2V0Lm9wdGlvbnMucmVzaXplLmludmVydCxcbiAgICAgICAgICAgICAgICBpbnZlcnRpYmxlID0gaW52ZXJ0ID09PSAncmVwb3NpdGlvbicgfHwgaW52ZXJ0ID09PSAnbmVnYXRlJztcblxuICAgICAgICAgICAgaWYgKGVkZ2VzKSB7XG4gICAgICAgICAgICAgICAgdmFyIGR4ID0gcmVzaXplRXZlbnQuZHgsXG4gICAgICAgICAgICAgICAgICAgIGR5ID0gcmVzaXplRXZlbnQuZHksXG5cbiAgICAgICAgICAgICAgICAgICAgc3RhcnQgICAgICA9IHRoaXMucmVzaXplUmVjdHMuc3RhcnQsXG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnQgICAgPSB0aGlzLnJlc2l6ZVJlY3RzLmN1cnJlbnQsXG4gICAgICAgICAgICAgICAgICAgIHJlc3RyaWN0ZWQgPSB0aGlzLnJlc2l6ZVJlY3RzLnJlc3RyaWN0ZWQsXG4gICAgICAgICAgICAgICAgICAgIGRlbHRhICAgICAgPSB0aGlzLnJlc2l6ZVJlY3RzLmRlbHRhLFxuICAgICAgICAgICAgICAgICAgICBwcmV2aW91cyAgID0gZXh0ZW5kKHRoaXMucmVzaXplUmVjdHMucHJldmlvdXMsIHJlc3RyaWN0ZWQpLFxuXG4gICAgICAgICAgICAgICAgICAgIG9yaWdpbmFsRWRnZXMgPSBlZGdlcztcblxuICAgICAgICAgICAgICAgIC8vIGByZXNpemUucHJlc2VydmVBc3BlY3RSYXRpb2AgdGFrZXMgcHJlY2VkZW5jZSBvdmVyIGByZXNpemUuc3F1YXJlYFxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnRhcmdldC5vcHRpb25zLnJlc2l6ZS5wcmVzZXJ2ZUFzcGVjdFJhdGlvKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciByZXNpemVTdGFydEFzcGVjdFJhdGlvID0gdGhpcy5yZXNpemVTdGFydEFzcGVjdFJhdGlvO1xuXG4gICAgICAgICAgICAgICAgICAgIGVkZ2VzID0gdGhpcy5wcmVwYXJlZC5fbGlua2VkRWRnZXM7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKChvcmlnaW5hbEVkZ2VzLmxlZnQgJiYgb3JpZ2luYWxFZGdlcy5ib3R0b20pXG4gICAgICAgICAgICAgICAgICAgICAgICB8fCAob3JpZ2luYWxFZGdlcy5yaWdodCAmJiBvcmlnaW5hbEVkZ2VzLnRvcCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGR5ID0gLWR4IC8gcmVzaXplU3RhcnRBc3BlY3RSYXRpbztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIGlmIChvcmlnaW5hbEVkZ2VzLmxlZnQgfHwgb3JpZ2luYWxFZGdlcy5yaWdodCkgeyBkeSA9IGR4IC8gcmVzaXplU3RhcnRBc3BlY3RSYXRpbzsgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIGlmIChvcmlnaW5hbEVkZ2VzLnRvcCB8fCBvcmlnaW5hbEVkZ2VzLmJvdHRvbSkgeyBkeCA9IGR5ICogcmVzaXplU3RhcnRBc3BlY3RSYXRpbzsgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmICh0aGlzLnRhcmdldC5vcHRpb25zLnJlc2l6ZS5zcXVhcmUpIHtcbiAgICAgICAgICAgICAgICAgICAgZWRnZXMgPSB0aGlzLnByZXBhcmVkLl9saW5rZWRFZGdlcztcblxuICAgICAgICAgICAgICAgICAgICBpZiAoKG9yaWdpbmFsRWRnZXMubGVmdCAmJiBvcmlnaW5hbEVkZ2VzLmJvdHRvbSlcbiAgICAgICAgICAgICAgICAgICAgICAgIHx8IChvcmlnaW5hbEVkZ2VzLnJpZ2h0ICYmIG9yaWdpbmFsRWRnZXMudG9wKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZHkgPSAtZHg7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAob3JpZ2luYWxFZGdlcy5sZWZ0IHx8IG9yaWdpbmFsRWRnZXMucmlnaHQpIHsgZHkgPSBkeDsgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIGlmIChvcmlnaW5hbEVkZ2VzLnRvcCB8fCBvcmlnaW5hbEVkZ2VzLmJvdHRvbSkgeyBkeCA9IGR5OyB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gdXBkYXRlIHRoZSAnY3VycmVudCcgcmVjdCB3aXRob3V0IG1vZGlmaWNhdGlvbnNcbiAgICAgICAgICAgICAgICBpZiAoZWRnZXMudG9wICAgKSB7IGN1cnJlbnQudG9wICAgICs9IGR5OyB9XG4gICAgICAgICAgICAgICAgaWYgKGVkZ2VzLmJvdHRvbSkgeyBjdXJyZW50LmJvdHRvbSArPSBkeTsgfVxuICAgICAgICAgICAgICAgIGlmIChlZGdlcy5sZWZ0ICApIHsgY3VycmVudC5sZWZ0ICAgKz0gZHg7IH1cbiAgICAgICAgICAgICAgICBpZiAoZWRnZXMucmlnaHQgKSB7IGN1cnJlbnQucmlnaHQgICs9IGR4OyB9XG5cbiAgICAgICAgICAgICAgICBpZiAoaW52ZXJ0aWJsZSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBpZiBpbnZlcnRpYmxlLCBjb3B5IHRoZSBjdXJyZW50IHJlY3RcbiAgICAgICAgICAgICAgICAgICAgZXh0ZW5kKHJlc3RyaWN0ZWQsIGN1cnJlbnQpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChpbnZlcnQgPT09ICdyZXBvc2l0aW9uJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gc3dhcCBlZGdlIHZhbHVlcyBpZiBuZWNlc3NhcnkgdG8ga2VlcCB3aWR0aC9oZWlnaHQgcG9zaXRpdmVcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBzd2FwO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVzdHJpY3RlZC50b3AgPiByZXN0cmljdGVkLmJvdHRvbSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN3YXAgPSByZXN0cmljdGVkLnRvcDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3RyaWN0ZWQudG9wID0gcmVzdHJpY3RlZC5ib3R0b207XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzdHJpY3RlZC5ib3R0b20gPSBzd2FwO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3RyaWN0ZWQubGVmdCA+IHJlc3RyaWN0ZWQucmlnaHQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzd2FwID0gcmVzdHJpY3RlZC5sZWZ0O1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzdHJpY3RlZC5sZWZ0ID0gcmVzdHJpY3RlZC5yaWdodDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXN0cmljdGVkLnJpZ2h0ID0gc3dhcDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gaWYgbm90IGludmVydGlibGUsIHJlc3RyaWN0IHRvIG1pbmltdW0gb2YgMHgwIHJlY3RcbiAgICAgICAgICAgICAgICAgICAgcmVzdHJpY3RlZC50b3AgICAgPSBNYXRoLm1pbihjdXJyZW50LnRvcCwgc3RhcnQuYm90dG9tKTtcbiAgICAgICAgICAgICAgICAgICAgcmVzdHJpY3RlZC5ib3R0b20gPSBNYXRoLm1heChjdXJyZW50LmJvdHRvbSwgc3RhcnQudG9wKTtcbiAgICAgICAgICAgICAgICAgICAgcmVzdHJpY3RlZC5sZWZ0ICAgPSBNYXRoLm1pbihjdXJyZW50LmxlZnQsIHN0YXJ0LnJpZ2h0KTtcbiAgICAgICAgICAgICAgICAgICAgcmVzdHJpY3RlZC5yaWdodCAgPSBNYXRoLm1heChjdXJyZW50LnJpZ2h0LCBzdGFydC5sZWZ0KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXN0cmljdGVkLndpZHRoICA9IHJlc3RyaWN0ZWQucmlnaHQgIC0gcmVzdHJpY3RlZC5sZWZ0O1xuICAgICAgICAgICAgICAgIHJlc3RyaWN0ZWQuaGVpZ2h0ID0gcmVzdHJpY3RlZC5ib3R0b20gLSByZXN0cmljdGVkLnRvcCA7XG5cbiAgICAgICAgICAgICAgICBmb3IgKHZhciBlZGdlIGluIHJlc3RyaWN0ZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVsdGFbZWRnZV0gPSByZXN0cmljdGVkW2VkZ2VdIC0gcHJldmlvdXNbZWRnZV07XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmVzaXplRXZlbnQuZWRnZXMgPSB0aGlzLnByZXBhcmVkLmVkZ2VzO1xuICAgICAgICAgICAgICAgIHJlc2l6ZUV2ZW50LnJlY3QgPSByZXN0cmljdGVkO1xuICAgICAgICAgICAgICAgIHJlc2l6ZUV2ZW50LmRlbHRhUmVjdCA9IGRlbHRhO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLnRhcmdldC5maXJlKHJlc2l6ZUV2ZW50KTtcblxuICAgICAgICAgICAgcmV0dXJuIHJlc2l6ZUV2ZW50O1xuICAgICAgICB9LFxuXG4gICAgICAgIGdlc3R1cmVTdGFydDogZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICB2YXIgZ2VzdHVyZUV2ZW50ID0gbmV3IEludGVyYWN0RXZlbnQodGhpcywgZXZlbnQsICdnZXN0dXJlJywgJ3N0YXJ0JywgdGhpcy5lbGVtZW50KTtcblxuICAgICAgICAgICAgZ2VzdHVyZUV2ZW50LmRzID0gMDtcblxuICAgICAgICAgICAgdGhpcy5nZXN0dXJlLnN0YXJ0RGlzdGFuY2UgPSB0aGlzLmdlc3R1cmUucHJldkRpc3RhbmNlID0gZ2VzdHVyZUV2ZW50LmRpc3RhbmNlO1xuICAgICAgICAgICAgdGhpcy5nZXN0dXJlLnN0YXJ0QW5nbGUgPSB0aGlzLmdlc3R1cmUucHJldkFuZ2xlID0gZ2VzdHVyZUV2ZW50LmFuZ2xlO1xuICAgICAgICAgICAgdGhpcy5nZXN0dXJlLnNjYWxlID0gMTtcblxuICAgICAgICAgICAgdGhpcy5nZXN0dXJpbmcgPSB0cnVlO1xuXG4gICAgICAgICAgICB0aGlzLnRhcmdldC5maXJlKGdlc3R1cmVFdmVudCk7XG5cbiAgICAgICAgICAgIHJldHVybiBnZXN0dXJlRXZlbnQ7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZ2VzdHVyZU1vdmU6IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgaWYgKCF0aGlzLnBvaW50ZXJJZHMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMucHJldkV2ZW50O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgZ2VzdHVyZUV2ZW50O1xuXG4gICAgICAgICAgICBnZXN0dXJlRXZlbnQgPSBuZXcgSW50ZXJhY3RFdmVudCh0aGlzLCBldmVudCwgJ2dlc3R1cmUnLCAnbW92ZScsIHRoaXMuZWxlbWVudCk7XG4gICAgICAgICAgICBnZXN0dXJlRXZlbnQuZHMgPSBnZXN0dXJlRXZlbnQuc2NhbGUgLSB0aGlzLmdlc3R1cmUuc2NhbGU7XG5cbiAgICAgICAgICAgIHRoaXMudGFyZ2V0LmZpcmUoZ2VzdHVyZUV2ZW50KTtcblxuICAgICAgICAgICAgdGhpcy5nZXN0dXJlLnByZXZBbmdsZSA9IGdlc3R1cmVFdmVudC5hbmdsZTtcbiAgICAgICAgICAgIHRoaXMuZ2VzdHVyZS5wcmV2RGlzdGFuY2UgPSBnZXN0dXJlRXZlbnQuZGlzdGFuY2U7XG5cbiAgICAgICAgICAgIGlmIChnZXN0dXJlRXZlbnQuc2NhbGUgIT09IEluZmluaXR5ICYmXG4gICAgICAgICAgICAgICAgZ2VzdHVyZUV2ZW50LnNjYWxlICE9PSBudWxsICYmXG4gICAgICAgICAgICAgICAgZ2VzdHVyZUV2ZW50LnNjYWxlICE9PSB1bmRlZmluZWQgICYmXG4gICAgICAgICAgICAgICAgIWlzTmFOKGdlc3R1cmVFdmVudC5zY2FsZSkpIHtcblxuICAgICAgICAgICAgICAgIHRoaXMuZ2VzdHVyZS5zY2FsZSA9IGdlc3R1cmVFdmVudC5zY2FsZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGdlc3R1cmVFdmVudDtcbiAgICAgICAgfSxcblxuICAgICAgICBwb2ludGVySG9sZDogZnVuY3Rpb24gKHBvaW50ZXIsIGV2ZW50LCBldmVudFRhcmdldCkge1xuICAgICAgICAgICAgdGhpcy5jb2xsZWN0RXZlbnRUYXJnZXRzKHBvaW50ZXIsIGV2ZW50LCBldmVudFRhcmdldCwgJ2hvbGQnKTtcbiAgICAgICAgfSxcblxuICAgICAgICBwb2ludGVyVXA6IGZ1bmN0aW9uIChwb2ludGVyLCBldmVudCwgZXZlbnRUYXJnZXQsIGN1ckV2ZW50VGFyZ2V0KSB7XG4gICAgICAgICAgICB2YXIgcG9pbnRlckluZGV4ID0gdGhpcy5tb3VzZT8gMCA6IGluZGV4T2YodGhpcy5wb2ludGVySWRzLCBnZXRQb2ludGVySWQocG9pbnRlcikpO1xuXG4gICAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5ob2xkVGltZXJzW3BvaW50ZXJJbmRleF0pO1xuXG4gICAgICAgICAgICB0aGlzLmNvbGxlY3RFdmVudFRhcmdldHMocG9pbnRlciwgZXZlbnQsIGV2ZW50VGFyZ2V0LCAndXAnICk7XG4gICAgICAgICAgICB0aGlzLmNvbGxlY3RFdmVudFRhcmdldHMocG9pbnRlciwgZXZlbnQsIGV2ZW50VGFyZ2V0LCAndGFwJyk7XG5cbiAgICAgICAgICAgIHRoaXMucG9pbnRlckVuZChwb2ludGVyLCBldmVudCwgZXZlbnRUYXJnZXQsIGN1ckV2ZW50VGFyZ2V0KTtcblxuICAgICAgICAgICAgdGhpcy5yZW1vdmVQb2ludGVyKHBvaW50ZXIpO1xuICAgICAgICB9LFxuXG4gICAgICAgIHBvaW50ZXJDYW5jZWw6IGZ1bmN0aW9uIChwb2ludGVyLCBldmVudCwgZXZlbnRUYXJnZXQsIGN1ckV2ZW50VGFyZ2V0KSB7XG4gICAgICAgICAgICB2YXIgcG9pbnRlckluZGV4ID0gdGhpcy5tb3VzZT8gMCA6IGluZGV4T2YodGhpcy5wb2ludGVySWRzLCBnZXRQb2ludGVySWQocG9pbnRlcikpO1xuXG4gICAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5ob2xkVGltZXJzW3BvaW50ZXJJbmRleF0pO1xuXG4gICAgICAgICAgICB0aGlzLmNvbGxlY3RFdmVudFRhcmdldHMocG9pbnRlciwgZXZlbnQsIGV2ZW50VGFyZ2V0LCAnY2FuY2VsJyk7XG4gICAgICAgICAgICB0aGlzLnBvaW50ZXJFbmQocG9pbnRlciwgZXZlbnQsIGV2ZW50VGFyZ2V0LCBjdXJFdmVudFRhcmdldCk7XG5cbiAgICAgICAgICAgIHRoaXMucmVtb3ZlUG9pbnRlcihwb2ludGVyKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvLyBodHRwOi8vd3d3LnF1aXJrc21vZGUub3JnL2RvbS9ldmVudHMvY2xpY2suaHRtbFxuICAgICAgICAvLyA+RXZlbnRzIGxlYWRpbmcgdG8gZGJsY2xpY2tcbiAgICAgICAgLy9cbiAgICAgICAgLy8gSUU4IGRvZXNuJ3QgZmlyZSBkb3duIGV2ZW50IGJlZm9yZSBkYmxjbGljay5cbiAgICAgICAgLy8gVGhpcyB3b3JrYXJvdW5kIHRyaWVzIHRvIGZpcmUgYSB0YXAgYW5kIGRvdWJsZXRhcCBhZnRlciBkYmxjbGlja1xuICAgICAgICBpZThEYmxjbGljazogZnVuY3Rpb24gKHBvaW50ZXIsIGV2ZW50LCBldmVudFRhcmdldCkge1xuICAgICAgICAgICAgaWYgKHRoaXMucHJldlRhcFxuICAgICAgICAgICAgICAgICYmIGV2ZW50LmNsaWVudFggPT09IHRoaXMucHJldlRhcC5jbGllbnRYXG4gICAgICAgICAgICAgICAgJiYgZXZlbnQuY2xpZW50WSA9PT0gdGhpcy5wcmV2VGFwLmNsaWVudFlcbiAgICAgICAgICAgICAgICAmJiBldmVudFRhcmdldCAgID09PSB0aGlzLnByZXZUYXAudGFyZ2V0KSB7XG5cbiAgICAgICAgICAgICAgICB0aGlzLmRvd25UYXJnZXRzWzBdID0gZXZlbnRUYXJnZXQ7XG4gICAgICAgICAgICAgICAgdGhpcy5kb3duVGltZXNbMF0gPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmNvbGxlY3RFdmVudFRhcmdldHMocG9pbnRlciwgZXZlbnQsIGV2ZW50VGFyZ2V0LCAndGFwJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgLy8gRW5kIGludGVyYWN0IG1vdmUgZXZlbnRzIGFuZCBzdG9wIGF1dG8tc2Nyb2xsIHVubGVzcyBpbmVydGlhIGlzIGVuYWJsZWRcbiAgICAgICAgcG9pbnRlckVuZDogZnVuY3Rpb24gKHBvaW50ZXIsIGV2ZW50LCBldmVudFRhcmdldCwgY3VyRXZlbnRUYXJnZXQpIHtcbiAgICAgICAgICAgIHZhciBlbmRFdmVudCxcbiAgICAgICAgICAgICAgICB0YXJnZXQgPSB0aGlzLnRhcmdldCxcbiAgICAgICAgICAgICAgICBvcHRpb25zID0gdGFyZ2V0ICYmIHRhcmdldC5vcHRpb25zLFxuICAgICAgICAgICAgICAgIGluZXJ0aWFPcHRpb25zID0gb3B0aW9ucyAmJiB0aGlzLnByZXBhcmVkLm5hbWUgJiYgb3B0aW9uc1t0aGlzLnByZXBhcmVkLm5hbWVdLmluZXJ0aWEsXG4gICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cyA9IHRoaXMuaW5lcnRpYVN0YXR1cztcblxuICAgICAgICAgICAgaWYgKHRoaXMuaW50ZXJhY3RpbmcoKSkge1xuXG4gICAgICAgICAgICAgICAgaWYgKGluZXJ0aWFTdGF0dXMuYWN0aXZlICYmICFpbmVydGlhU3RhdHVzLmVuZGluZykgeyByZXR1cm47IH1cblxuICAgICAgICAgICAgICAgIHZhciBwb2ludGVyU3BlZWQsXG4gICAgICAgICAgICAgICAgICAgIG5vdyA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpLFxuICAgICAgICAgICAgICAgICAgICBpbmVydGlhUG9zc2libGUgPSBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgaW5lcnRpYSA9IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBzbW9vdGhFbmQgPSBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZW5kU25hcCA9IGNoZWNrU25hcCh0YXJnZXQsIHRoaXMucHJlcGFyZWQubmFtZSkgJiYgb3B0aW9uc1t0aGlzLnByZXBhcmVkLm5hbWVdLnNuYXAuZW5kT25seSxcbiAgICAgICAgICAgICAgICAgICAgZW5kUmVzdHJpY3QgPSBjaGVja1Jlc3RyaWN0KHRhcmdldCwgdGhpcy5wcmVwYXJlZC5uYW1lKSAmJiBvcHRpb25zW3RoaXMucHJlcGFyZWQubmFtZV0ucmVzdHJpY3QuZW5kT25seSxcbiAgICAgICAgICAgICAgICAgICAgZHggPSAwLFxuICAgICAgICAgICAgICAgICAgICBkeSA9IDAsXG4gICAgICAgICAgICAgICAgICAgIHN0YXJ0RXZlbnQ7XG5cbiAgICAgICAgICAgICAgICBpZiAodGhpcy5kcmFnZ2luZykge1xuICAgICAgICAgICAgICAgICAgICBpZiAgICAgIChvcHRpb25zLmRyYWcuYXhpcyA9PT0gJ3gnICkgeyBwb2ludGVyU3BlZWQgPSBNYXRoLmFicyh0aGlzLnBvaW50ZXJEZWx0YS5jbGllbnQudngpOyB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKG9wdGlvbnMuZHJhZy5heGlzID09PSAneScgKSB7IHBvaW50ZXJTcGVlZCA9IE1hdGguYWJzKHRoaXMucG9pbnRlckRlbHRhLmNsaWVudC52eSk7IH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSAgIC8qb3B0aW9ucy5kcmFnLmF4aXMgPT09ICd4eScqL3sgcG9pbnRlclNwZWVkID0gdGhpcy5wb2ludGVyRGVsdGEuY2xpZW50LnNwZWVkOyB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBwb2ludGVyU3BlZWQgPSB0aGlzLnBvaW50ZXJEZWx0YS5jbGllbnQuc3BlZWQ7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gY2hlY2sgaWYgaW5lcnRpYSBzaG91bGQgYmUgc3RhcnRlZFxuICAgICAgICAgICAgICAgIGluZXJ0aWFQb3NzaWJsZSA9IChpbmVydGlhT3B0aW9ucyAmJiBpbmVydGlhT3B0aW9ucy5lbmFibGVkXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICYmIHRoaXMucHJlcGFyZWQubmFtZSAhPT0gJ2dlc3R1cmUnXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICYmIGV2ZW50ICE9PSBpbmVydGlhU3RhdHVzLnN0YXJ0RXZlbnQpO1xuXG4gICAgICAgICAgICAgICAgaW5lcnRpYSA9IChpbmVydGlhUG9zc2libGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICYmIChub3cgLSB0aGlzLmN1ckNvb3Jkcy50aW1lU3RhbXApIDwgNTBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICYmIHBvaW50ZXJTcGVlZCA+IGluZXJ0aWFPcHRpb25zLm1pblNwZWVkXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAmJiBwb2ludGVyU3BlZWQgPiBpbmVydGlhT3B0aW9ucy5lbmRTcGVlZCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoaW5lcnRpYVBvc3NpYmxlICYmICFpbmVydGlhICYmIChlbmRTbmFwIHx8IGVuZFJlc3RyaWN0KSkge1xuXG4gICAgICAgICAgICAgICAgICAgIHZhciBzbmFwUmVzdHJpY3QgPSB7fTtcblxuICAgICAgICAgICAgICAgICAgICBzbmFwUmVzdHJpY3Quc25hcCA9IHNuYXBSZXN0cmljdC5yZXN0cmljdCA9IHNuYXBSZXN0cmljdDtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoZW5kU25hcCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXRTbmFwcGluZyh0aGlzLmN1ckNvb3Jkcy5wYWdlLCBzbmFwUmVzdHJpY3QpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHNuYXBSZXN0cmljdC5sb2NrZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkeCArPSBzbmFwUmVzdHJpY3QuZHg7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZHkgKz0gc25hcFJlc3RyaWN0LmR5O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGVuZFJlc3RyaWN0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNldFJlc3RyaWN0aW9uKHRoaXMuY3VyQ29vcmRzLnBhZ2UsIHNuYXBSZXN0cmljdCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoc25hcFJlc3RyaWN0LnJlc3RyaWN0ZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkeCArPSBzbmFwUmVzdHJpY3QuZHg7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZHkgKz0gc25hcFJlc3RyaWN0LmR5O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGR4IHx8IGR5KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzbW9vdGhFbmQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGluZXJ0aWEgfHwgc21vb3RoRW5kKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvcHlDb29yZHMoaW5lcnRpYVN0YXR1cy51cENvb3JkcywgdGhpcy5jdXJDb29yZHMpO1xuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucG9pbnRlcnNbMF0gPSBpbmVydGlhU3RhdHVzLnN0YXJ0RXZlbnQgPSBzdGFydEV2ZW50ID1cbiAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBJbnRlcmFjdEV2ZW50KHRoaXMsIGV2ZW50LCB0aGlzLnByZXBhcmVkLm5hbWUsICdpbmVydGlhc3RhcnQnLCB0aGlzLmVsZW1lbnQpO1xuXG4gICAgICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMudDAgPSBub3c7XG5cbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0LmZpcmUoaW5lcnRpYVN0YXR1cy5zdGFydEV2ZW50KTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoaW5lcnRpYSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy52eDAgPSB0aGlzLnBvaW50ZXJEZWx0YS5jbGllbnQudng7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbmVydGlhU3RhdHVzLnZ5MCA9IHRoaXMucG9pbnRlckRlbHRhLmNsaWVudC52eTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMudjAgPSBwb2ludGVyU3BlZWQ7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY2FsY0luZXJ0aWEoaW5lcnRpYVN0YXR1cyk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBwYWdlID0gZXh0ZW5kKHt9LCB0aGlzLmN1ckNvb3Jkcy5wYWdlKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcmlnaW4gPSBnZXRPcmlnaW5YWSh0YXJnZXQsIHRoaXMuZWxlbWVudCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdHVzT2JqZWN0O1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBwYWdlLnggPSBwYWdlLnggKyBpbmVydGlhU3RhdHVzLnhlIC0gb3JpZ2luLng7XG4gICAgICAgICAgICAgICAgICAgICAgICBwYWdlLnkgPSBwYWdlLnkgKyBpbmVydGlhU3RhdHVzLnllIC0gb3JpZ2luLnk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXR1c09iamVjdCA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1c2VTdGF0dXNYWTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB4OiBwYWdlLngsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgeTogcGFnZS55LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGR4OiAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGR5OiAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNuYXA6IG51bGxcbiAgICAgICAgICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXR1c09iamVjdC5zbmFwID0gc3RhdHVzT2JqZWN0O1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBkeCA9IGR5ID0gMDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGVuZFNuYXApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgc25hcCA9IHRoaXMuc2V0U25hcHBpbmcodGhpcy5jdXJDb29yZHMucGFnZSwgc3RhdHVzT2JqZWN0KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzbmFwLmxvY2tlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkeCArPSBzbmFwLmR4O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkeSArPSBzbmFwLmR5O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGVuZFJlc3RyaWN0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHJlc3RyaWN0ID0gdGhpcy5zZXRSZXN0cmljdGlvbih0aGlzLmN1ckNvb3Jkcy5wYWdlLCBzdGF0dXNPYmplY3QpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3RyaWN0LnJlc3RyaWN0ZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZHggKz0gcmVzdHJpY3QuZHg7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGR5ICs9IHJlc3RyaWN0LmR5O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy5tb2RpZmllZFhlICs9IGR4O1xuICAgICAgICAgICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy5tb2RpZmllZFllICs9IGR5O1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpbmVydGlhU3RhdHVzLmkgPSByZXFGcmFtZSh0aGlzLmJvdW5kSW5lcnRpYUZyYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMuc21vb3RoRW5kID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMueGUgPSBkeDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMueWUgPSBkeTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy5zeCA9IGluZXJ0aWFTdGF0dXMuc3kgPSAwO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpbmVydGlhU3RhdHVzLmkgPSByZXFGcmFtZSh0aGlzLmJvdW5kU21vb3RoRW5kRnJhbWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy5hY3RpdmUgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGVuZFNuYXAgfHwgZW5kUmVzdHJpY3QpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gZmlyZSBhIG1vdmUgZXZlbnQgYXQgdGhlIHNuYXBwZWQgY29vcmRpbmF0ZXNcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wb2ludGVyTW92ZShwb2ludGVyLCBldmVudCwgZXZlbnRUYXJnZXQsIGN1ckV2ZW50VGFyZ2V0LCB0cnVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0aGlzLmRyYWdnaW5nKSB7XG4gICAgICAgICAgICAgICAgZW5kRXZlbnQgPSBuZXcgSW50ZXJhY3RFdmVudCh0aGlzLCBldmVudCwgJ2RyYWcnLCAnZW5kJywgdGhpcy5lbGVtZW50KTtcblxuICAgICAgICAgICAgICAgIHZhciBkcmFnZ2FibGVFbGVtZW50ID0gdGhpcy5lbGVtZW50LFxuICAgICAgICAgICAgICAgICAgICBkcm9wID0gdGhpcy5nZXREcm9wKGVuZEV2ZW50LCBldmVudCwgZHJhZ2dhYmxlRWxlbWVudCk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLmRyb3BUYXJnZXQgPSBkcm9wLmRyb3B6b25lO1xuICAgICAgICAgICAgICAgIHRoaXMuZHJvcEVsZW1lbnQgPSBkcm9wLmVsZW1lbnQ7XG5cbiAgICAgICAgICAgICAgICB2YXIgZHJvcEV2ZW50cyA9IHRoaXMuZ2V0RHJvcEV2ZW50cyhldmVudCwgZW5kRXZlbnQpO1xuXG4gICAgICAgICAgICAgICAgaWYgKGRyb3BFdmVudHMubGVhdmUpIHsgdGhpcy5wcmV2RHJvcFRhcmdldC5maXJlKGRyb3BFdmVudHMubGVhdmUpOyB9XG4gICAgICAgICAgICAgICAgaWYgKGRyb3BFdmVudHMuZW50ZXIpIHsgICAgIHRoaXMuZHJvcFRhcmdldC5maXJlKGRyb3BFdmVudHMuZW50ZXIpOyB9XG4gICAgICAgICAgICAgICAgaWYgKGRyb3BFdmVudHMuZHJvcCApIHsgICAgIHRoaXMuZHJvcFRhcmdldC5maXJlKGRyb3BFdmVudHMuZHJvcCApOyB9XG4gICAgICAgICAgICAgICAgaWYgKGRyb3BFdmVudHMuZGVhY3RpdmF0ZSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmZpcmVBY3RpdmVEcm9wcyhkcm9wRXZlbnRzLmRlYWN0aXZhdGUpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRhcmdldC5maXJlKGVuZEV2ZW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKHRoaXMucmVzaXppbmcpIHtcbiAgICAgICAgICAgICAgICBlbmRFdmVudCA9IG5ldyBJbnRlcmFjdEV2ZW50KHRoaXMsIGV2ZW50LCAncmVzaXplJywgJ2VuZCcsIHRoaXMuZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgdGFyZ2V0LmZpcmUoZW5kRXZlbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAodGhpcy5nZXN0dXJpbmcpIHtcbiAgICAgICAgICAgICAgICBlbmRFdmVudCA9IG5ldyBJbnRlcmFjdEV2ZW50KHRoaXMsIGV2ZW50LCAnZ2VzdHVyZScsICdlbmQnLCB0aGlzLmVsZW1lbnQpO1xuICAgICAgICAgICAgICAgIHRhcmdldC5maXJlKGVuZEV2ZW50KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5zdG9wKGV2ZW50KTtcbiAgICAgICAgfSxcblxuICAgICAgICBjb2xsZWN0RHJvcHM6IGZ1bmN0aW9uIChlbGVtZW50KSB7XG4gICAgICAgICAgICB2YXIgZHJvcHMgPSBbXSxcbiAgICAgICAgICAgICAgICBlbGVtZW50cyA9IFtdLFxuICAgICAgICAgICAgICAgIGk7XG5cbiAgICAgICAgICAgIGVsZW1lbnQgPSBlbGVtZW50IHx8IHRoaXMuZWxlbWVudDtcblxuICAgICAgICAgICAgLy8gY29sbGVjdCBhbGwgZHJvcHpvbmVzIGFuZCB0aGVpciBlbGVtZW50cyB3aGljaCBxdWFsaWZ5IGZvciBhIGRyb3BcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBpbnRlcmFjdGFibGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFpbnRlcmFjdGFibGVzW2ldLm9wdGlvbnMuZHJvcC5lbmFibGVkKSB7IGNvbnRpbnVlOyB9XG5cbiAgICAgICAgICAgICAgICB2YXIgY3VycmVudCA9IGludGVyYWN0YWJsZXNbaV0sXG4gICAgICAgICAgICAgICAgICAgIGFjY2VwdCA9IGN1cnJlbnQub3B0aW9ucy5kcm9wLmFjY2VwdDtcblxuICAgICAgICAgICAgICAgIC8vIHRlc3QgdGhlIGRyYWdnYWJsZSBlbGVtZW50IGFnYWluc3QgdGhlIGRyb3B6b25lJ3MgYWNjZXB0IHNldHRpbmdcbiAgICAgICAgICAgICAgICBpZiAoKGlzRWxlbWVudChhY2NlcHQpICYmIGFjY2VwdCAhPT0gZWxlbWVudClcbiAgICAgICAgICAgICAgICAgICAgfHwgKGlzU3RyaW5nKGFjY2VwdClcbiAgICAgICAgICAgICAgICAgICAgICAgICYmICFtYXRjaGVzU2VsZWN0b3IoZWxlbWVudCwgYWNjZXB0KSkpIHtcblxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBxdWVyeSBmb3IgbmV3IGVsZW1lbnRzIGlmIG5lY2Vzc2FyeVxuICAgICAgICAgICAgICAgIHZhciBkcm9wRWxlbWVudHMgPSBjdXJyZW50LnNlbGVjdG9yPyBjdXJyZW50Ll9jb250ZXh0LnF1ZXJ5U2VsZWN0b3JBbGwoY3VycmVudC5zZWxlY3RvcikgOiBbY3VycmVudC5fZWxlbWVudF07XG5cbiAgICAgICAgICAgICAgICBmb3IgKHZhciBqID0gMCwgbGVuID0gZHJvcEVsZW1lbnRzLmxlbmd0aDsgaiA8IGxlbjsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBjdXJyZW50RWxlbWVudCA9IGRyb3BFbGVtZW50c1tqXTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoY3VycmVudEVsZW1lbnQgPT09IGVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgZHJvcHMucHVzaChjdXJyZW50KTtcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudHMucHVzaChjdXJyZW50RWxlbWVudCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIGRyb3B6b25lczogZHJvcHMsXG4gICAgICAgICAgICAgICAgZWxlbWVudHM6IGVsZW1lbnRzXG4gICAgICAgICAgICB9O1xuICAgICAgICB9LFxuXG4gICAgICAgIGZpcmVBY3RpdmVEcm9wczogZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICB2YXIgaSxcbiAgICAgICAgICAgICAgICBjdXJyZW50LFxuICAgICAgICAgICAgICAgIGN1cnJlbnRFbGVtZW50LFxuICAgICAgICAgICAgICAgIHByZXZFbGVtZW50O1xuXG4gICAgICAgICAgICAvLyBsb29wIHRocm91Z2ggYWxsIGFjdGl2ZSBkcm9wem9uZXMgYW5kIHRyaWdnZXIgZXZlbnRcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCB0aGlzLmFjdGl2ZURyb3BzLmRyb3B6b25lcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGN1cnJlbnQgPSB0aGlzLmFjdGl2ZURyb3BzLmRyb3B6b25lc1tpXTtcbiAgICAgICAgICAgICAgICBjdXJyZW50RWxlbWVudCA9IHRoaXMuYWN0aXZlRHJvcHMuZWxlbWVudHMgW2ldO1xuXG4gICAgICAgICAgICAgICAgLy8gcHJldmVudCB0cmlnZ2VyIG9mIGR1cGxpY2F0ZSBldmVudHMgb24gc2FtZSBlbGVtZW50XG4gICAgICAgICAgICAgICAgaWYgKGN1cnJlbnRFbGVtZW50ICE9PSBwcmV2RWxlbWVudCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBzZXQgY3VycmVudCBlbGVtZW50IGFzIGV2ZW50IHRhcmdldFxuICAgICAgICAgICAgICAgICAgICBldmVudC50YXJnZXQgPSBjdXJyZW50RWxlbWVudDtcbiAgICAgICAgICAgICAgICAgICAgY3VycmVudC5maXJlKGV2ZW50KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcHJldkVsZW1lbnQgPSBjdXJyZW50RWxlbWVudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICAvLyBDb2xsZWN0IGEgbmV3IHNldCBvZiBwb3NzaWJsZSBkcm9wcyBhbmQgc2F2ZSB0aGVtIGluIGFjdGl2ZURyb3BzLlxuICAgICAgICAvLyBzZXRBY3RpdmVEcm9wcyBzaG91bGQgYWx3YXlzIGJlIGNhbGxlZCB3aGVuIGEgZHJhZyBoYXMganVzdCBzdGFydGVkIG9yIGFcbiAgICAgICAgLy8gZHJhZyBldmVudCBoYXBwZW5zIHdoaWxlIGR5bmFtaWNEcm9wIGlzIHRydWVcbiAgICAgICAgc2V0QWN0aXZlRHJvcHM6IGZ1bmN0aW9uIChkcmFnRWxlbWVudCkge1xuICAgICAgICAgICAgLy8gZ2V0IGRyb3B6b25lcyBhbmQgdGhlaXIgZWxlbWVudHMgdGhhdCBjb3VsZCByZWNlaXZlIHRoZSBkcmFnZ2FibGVcbiAgICAgICAgICAgIHZhciBwb3NzaWJsZURyb3BzID0gdGhpcy5jb2xsZWN0RHJvcHMoZHJhZ0VsZW1lbnQsIHRydWUpO1xuXG4gICAgICAgICAgICB0aGlzLmFjdGl2ZURyb3BzLmRyb3B6b25lcyA9IHBvc3NpYmxlRHJvcHMuZHJvcHpvbmVzO1xuICAgICAgICAgICAgdGhpcy5hY3RpdmVEcm9wcy5lbGVtZW50cyAgPSBwb3NzaWJsZURyb3BzLmVsZW1lbnRzO1xuICAgICAgICAgICAgdGhpcy5hY3RpdmVEcm9wcy5yZWN0cyAgICAgPSBbXTtcblxuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmFjdGl2ZURyb3BzLmRyb3B6b25lcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIHRoaXMuYWN0aXZlRHJvcHMucmVjdHNbaV0gPSB0aGlzLmFjdGl2ZURyb3BzLmRyb3B6b25lc1tpXS5nZXRSZWN0KHRoaXMuYWN0aXZlRHJvcHMuZWxlbWVudHNbaV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIGdldERyb3A6IGZ1bmN0aW9uIChkcmFnRXZlbnQsIGV2ZW50LCBkcmFnRWxlbWVudCkge1xuICAgICAgICAgICAgdmFyIHZhbGlkRHJvcHMgPSBbXTtcblxuICAgICAgICAgICAgaWYgKGR5bmFtaWNEcm9wKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRBY3RpdmVEcm9wcyhkcmFnRWxlbWVudCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGNvbGxlY3QgYWxsIGRyb3B6b25lcyBhbmQgdGhlaXIgZWxlbWVudHMgd2hpY2ggcXVhbGlmeSBmb3IgYSBkcm9wXG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMuYWN0aXZlRHJvcHMuZHJvcHpvbmVzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICAgICAgdmFyIGN1cnJlbnQgICAgICAgID0gdGhpcy5hY3RpdmVEcm9wcy5kcm9wem9uZXNbal0sXG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnRFbGVtZW50ID0gdGhpcy5hY3RpdmVEcm9wcy5lbGVtZW50cyBbal0sXG4gICAgICAgICAgICAgICAgICAgIHJlY3QgICAgICAgICAgID0gdGhpcy5hY3RpdmVEcm9wcy5yZWN0cyAgICBbal07XG5cbiAgICAgICAgICAgICAgICB2YWxpZERyb3BzLnB1c2goY3VycmVudC5kcm9wQ2hlY2soZHJhZ0V2ZW50LCBldmVudCwgdGhpcy50YXJnZXQsIGRyYWdFbGVtZW50LCBjdXJyZW50RWxlbWVudCwgcmVjdClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPyBjdXJyZW50RWxlbWVudFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA6IG51bGwpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBnZXQgdGhlIG1vc3QgYXBwcm9wcmlhdGUgZHJvcHpvbmUgYmFzZWQgb24gRE9NIGRlcHRoIGFuZCBvcmRlclxuICAgICAgICAgICAgdmFyIGRyb3BJbmRleCA9IGluZGV4T2ZEZWVwZXN0RWxlbWVudCh2YWxpZERyb3BzKSxcbiAgICAgICAgICAgICAgICBkcm9wem9uZSAgPSB0aGlzLmFjdGl2ZURyb3BzLmRyb3B6b25lc1tkcm9wSW5kZXhdIHx8IG51bGwsXG4gICAgICAgICAgICAgICAgZWxlbWVudCAgID0gdGhpcy5hY3RpdmVEcm9wcy5lbGVtZW50cyBbZHJvcEluZGV4XSB8fCBudWxsO1xuXG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIGRyb3B6b25lOiBkcm9wem9uZSxcbiAgICAgICAgICAgICAgICBlbGVtZW50OiBlbGVtZW50XG4gICAgICAgICAgICB9O1xuICAgICAgICB9LFxuXG4gICAgICAgIGdldERyb3BFdmVudHM6IGZ1bmN0aW9uIChwb2ludGVyRXZlbnQsIGRyYWdFdmVudCkge1xuICAgICAgICAgICAgdmFyIGRyb3BFdmVudHMgPSB7XG4gICAgICAgICAgICAgICAgZW50ZXIgICAgIDogbnVsbCxcbiAgICAgICAgICAgICAgICBsZWF2ZSAgICAgOiBudWxsLFxuICAgICAgICAgICAgICAgIGFjdGl2YXRlICA6IG51bGwsXG4gICAgICAgICAgICAgICAgZGVhY3RpdmF0ZTogbnVsbCxcbiAgICAgICAgICAgICAgICBtb3ZlICAgICAgOiBudWxsLFxuICAgICAgICAgICAgICAgIGRyb3AgICAgICA6IG51bGxcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGlmICh0aGlzLmRyb3BFbGVtZW50ICE9PSB0aGlzLnByZXZEcm9wRWxlbWVudCkge1xuICAgICAgICAgICAgICAgIC8vIGlmIHRoZXJlIHdhcyBhIHByZXZEcm9wVGFyZ2V0LCBjcmVhdGUgYSBkcmFnbGVhdmUgZXZlbnRcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5wcmV2RHJvcFRhcmdldCkge1xuICAgICAgICAgICAgICAgICAgICBkcm9wRXZlbnRzLmxlYXZlID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0ICAgICAgIDogdGhpcy5wcmV2RHJvcEVsZW1lbnQsXG4gICAgICAgICAgICAgICAgICAgICAgICBkcm9wem9uZSAgICAgOiB0aGlzLnByZXZEcm9wVGFyZ2V0LFxuICAgICAgICAgICAgICAgICAgICAgICAgcmVsYXRlZFRhcmdldDogZHJhZ0V2ZW50LnRhcmdldCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRyYWdnYWJsZSAgICA6IGRyYWdFdmVudC5pbnRlcmFjdGFibGUsXG4gICAgICAgICAgICAgICAgICAgICAgICBkcmFnRXZlbnQgICAgOiBkcmFnRXZlbnQsXG4gICAgICAgICAgICAgICAgICAgICAgICBpbnRlcmFjdGlvbiAgOiB0aGlzLFxuICAgICAgICAgICAgICAgICAgICAgICAgdGltZVN0YW1wICAgIDogZHJhZ0V2ZW50LnRpbWVTdGFtcCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGUgICAgICAgICA6ICdkcmFnbGVhdmUnXG4gICAgICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAgICAgZHJhZ0V2ZW50LmRyYWdMZWF2ZSA9IHRoaXMucHJldkRyb3BFbGVtZW50O1xuICAgICAgICAgICAgICAgICAgICBkcmFnRXZlbnQucHJldkRyb3B6b25lID0gdGhpcy5wcmV2RHJvcFRhcmdldDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gaWYgdGhlIGRyb3BUYXJnZXQgaXMgbm90IG51bGwsIGNyZWF0ZSBhIGRyYWdlbnRlciBldmVudFxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmRyb3BUYXJnZXQpIHtcbiAgICAgICAgICAgICAgICAgICAgZHJvcEV2ZW50cy5lbnRlciA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldCAgICAgICA6IHRoaXMuZHJvcEVsZW1lbnQsXG4gICAgICAgICAgICAgICAgICAgICAgICBkcm9wem9uZSAgICAgOiB0aGlzLmRyb3BUYXJnZXQsXG4gICAgICAgICAgICAgICAgICAgICAgICByZWxhdGVkVGFyZ2V0OiBkcmFnRXZlbnQudGFyZ2V0LFxuICAgICAgICAgICAgICAgICAgICAgICAgZHJhZ2dhYmxlICAgIDogZHJhZ0V2ZW50LmludGVyYWN0YWJsZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRyYWdFdmVudCAgICA6IGRyYWdFdmVudCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGludGVyYWN0aW9uICA6IHRoaXMsXG4gICAgICAgICAgICAgICAgICAgICAgICB0aW1lU3RhbXAgICAgOiBkcmFnRXZlbnQudGltZVN0YW1wLFxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZSAgICAgICAgIDogJ2RyYWdlbnRlcidcbiAgICAgICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgICAgICBkcmFnRXZlbnQuZHJhZ0VudGVyID0gdGhpcy5kcm9wRWxlbWVudDtcbiAgICAgICAgICAgICAgICAgICAgZHJhZ0V2ZW50LmRyb3B6b25lID0gdGhpcy5kcm9wVGFyZ2V0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGRyYWdFdmVudC50eXBlID09PSAnZHJhZ2VuZCcgJiYgdGhpcy5kcm9wVGFyZ2V0KSB7XG4gICAgICAgICAgICAgICAgZHJvcEV2ZW50cy5kcm9wID0ge1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQgICAgICAgOiB0aGlzLmRyb3BFbGVtZW50LFxuICAgICAgICAgICAgICAgICAgICBkcm9wem9uZSAgICAgOiB0aGlzLmRyb3BUYXJnZXQsXG4gICAgICAgICAgICAgICAgICAgIHJlbGF0ZWRUYXJnZXQ6IGRyYWdFdmVudC50YXJnZXQsXG4gICAgICAgICAgICAgICAgICAgIGRyYWdnYWJsZSAgICA6IGRyYWdFdmVudC5pbnRlcmFjdGFibGUsXG4gICAgICAgICAgICAgICAgICAgIGRyYWdFdmVudCAgICA6IGRyYWdFdmVudCxcbiAgICAgICAgICAgICAgICAgICAgaW50ZXJhY3Rpb24gIDogdGhpcyxcbiAgICAgICAgICAgICAgICAgICAgdGltZVN0YW1wICAgIDogZHJhZ0V2ZW50LnRpbWVTdGFtcCxcbiAgICAgICAgICAgICAgICAgICAgdHlwZSAgICAgICAgIDogJ2Ryb3AnXG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIGRyYWdFdmVudC5kcm9wem9uZSA9IHRoaXMuZHJvcFRhcmdldDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChkcmFnRXZlbnQudHlwZSA9PT0gJ2RyYWdzdGFydCcpIHtcbiAgICAgICAgICAgICAgICBkcm9wRXZlbnRzLmFjdGl2YXRlID0ge1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQgICAgICAgOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBkcm9wem9uZSAgICAgOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICByZWxhdGVkVGFyZ2V0OiBkcmFnRXZlbnQudGFyZ2V0LFxuICAgICAgICAgICAgICAgICAgICBkcmFnZ2FibGUgICAgOiBkcmFnRXZlbnQuaW50ZXJhY3RhYmxlLFxuICAgICAgICAgICAgICAgICAgICBkcmFnRXZlbnQgICAgOiBkcmFnRXZlbnQsXG4gICAgICAgICAgICAgICAgICAgIGludGVyYWN0aW9uICA6IHRoaXMsXG4gICAgICAgICAgICAgICAgICAgIHRpbWVTdGFtcCAgICA6IGRyYWdFdmVudC50aW1lU3RhbXAsXG4gICAgICAgICAgICAgICAgICAgIHR5cGUgICAgICAgICA6ICdkcm9wYWN0aXZhdGUnXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChkcmFnRXZlbnQudHlwZSA9PT0gJ2RyYWdlbmQnKSB7XG4gICAgICAgICAgICAgICAgZHJvcEV2ZW50cy5kZWFjdGl2YXRlID0ge1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQgICAgICAgOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBkcm9wem9uZSAgICAgOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICByZWxhdGVkVGFyZ2V0OiBkcmFnRXZlbnQudGFyZ2V0LFxuICAgICAgICAgICAgICAgICAgICBkcmFnZ2FibGUgICAgOiBkcmFnRXZlbnQuaW50ZXJhY3RhYmxlLFxuICAgICAgICAgICAgICAgICAgICBkcmFnRXZlbnQgICAgOiBkcmFnRXZlbnQsXG4gICAgICAgICAgICAgICAgICAgIGludGVyYWN0aW9uICA6IHRoaXMsXG4gICAgICAgICAgICAgICAgICAgIHRpbWVTdGFtcCAgICA6IGRyYWdFdmVudC50aW1lU3RhbXAsXG4gICAgICAgICAgICAgICAgICAgIHR5cGUgICAgICAgICA6ICdkcm9wZGVhY3RpdmF0ZSdcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGRyYWdFdmVudC50eXBlID09PSAnZHJhZ21vdmUnICYmIHRoaXMuZHJvcFRhcmdldCkge1xuICAgICAgICAgICAgICAgIGRyb3BFdmVudHMubW92ZSA9IHtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0ICAgICAgIDogdGhpcy5kcm9wRWxlbWVudCxcbiAgICAgICAgICAgICAgICAgICAgZHJvcHpvbmUgICAgIDogdGhpcy5kcm9wVGFyZ2V0LFxuICAgICAgICAgICAgICAgICAgICByZWxhdGVkVGFyZ2V0OiBkcmFnRXZlbnQudGFyZ2V0LFxuICAgICAgICAgICAgICAgICAgICBkcmFnZ2FibGUgICAgOiBkcmFnRXZlbnQuaW50ZXJhY3RhYmxlLFxuICAgICAgICAgICAgICAgICAgICBkcmFnRXZlbnQgICAgOiBkcmFnRXZlbnQsXG4gICAgICAgICAgICAgICAgICAgIGludGVyYWN0aW9uICA6IHRoaXMsXG4gICAgICAgICAgICAgICAgICAgIGRyYWdtb3ZlICAgICA6IGRyYWdFdmVudCxcbiAgICAgICAgICAgICAgICAgICAgdGltZVN0YW1wICAgIDogZHJhZ0V2ZW50LnRpbWVTdGFtcCxcbiAgICAgICAgICAgICAgICAgICAgdHlwZSAgICAgICAgIDogJ2Ryb3Btb3ZlJ1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgZHJhZ0V2ZW50LmRyb3B6b25lID0gdGhpcy5kcm9wVGFyZ2V0O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gZHJvcEV2ZW50cztcbiAgICAgICAgfSxcblxuICAgICAgICBjdXJyZW50QWN0aW9uOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gKHRoaXMuZHJhZ2dpbmcgJiYgJ2RyYWcnKSB8fCAodGhpcy5yZXNpemluZyAmJiAncmVzaXplJykgfHwgKHRoaXMuZ2VzdHVyaW5nICYmICdnZXN0dXJlJykgfHwgbnVsbDtcbiAgICAgICAgfSxcblxuICAgICAgICBpbnRlcmFjdGluZzogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZHJhZ2dpbmcgfHwgdGhpcy5yZXNpemluZyB8fCB0aGlzLmdlc3R1cmluZztcbiAgICAgICAgfSxcblxuICAgICAgICBjbGVhclRhcmdldHM6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMudGFyZ2V0ID0gdGhpcy5lbGVtZW50ID0gbnVsbDtcblxuICAgICAgICAgICAgdGhpcy5kcm9wVGFyZ2V0ID0gdGhpcy5kcm9wRWxlbWVudCA9IHRoaXMucHJldkRyb3BUYXJnZXQgPSB0aGlzLnByZXZEcm9wRWxlbWVudCA9IG51bGw7XG4gICAgICAgIH0sXG5cbiAgICAgICAgc3RvcDogZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICBpZiAodGhpcy5pbnRlcmFjdGluZygpKSB7XG4gICAgICAgICAgICAgICAgYXV0b1Njcm9sbC5zdG9wKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5tYXRjaGVzID0gW107XG4gICAgICAgICAgICAgICAgdGhpcy5tYXRjaEVsZW1lbnRzID0gW107XG5cbiAgICAgICAgICAgICAgICB2YXIgdGFyZ2V0ID0gdGhpcy50YXJnZXQ7XG5cbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0Lm9wdGlvbnMuc3R5bGVDdXJzb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Ll9kb2MuZG9jdW1lbnRFbGVtZW50LnN0eWxlLmN1cnNvciA9ICcnO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIHByZXZlbnQgRGVmYXVsdCBvbmx5IGlmIHdlcmUgcHJldmlvdXNseSBpbnRlcmFjdGluZ1xuICAgICAgICAgICAgICAgIGlmIChldmVudCAmJiBpc0Z1bmN0aW9uKGV2ZW50LnByZXZlbnREZWZhdWx0KSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmNoZWNrQW5kUHJldmVudERlZmF1bHQoZXZlbnQsIHRhcmdldCwgdGhpcy5lbGVtZW50KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodGhpcy5kcmFnZ2luZykge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZURyb3BzLmRyb3B6b25lcyA9IHRoaXMuYWN0aXZlRHJvcHMuZWxlbWVudHMgPSB0aGlzLmFjdGl2ZURyb3BzLnJlY3RzID0gbnVsbDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuY2xlYXJUYXJnZXRzKCk7XG5cbiAgICAgICAgICAgIHRoaXMucG9pbnRlcklzRG93biA9IHRoaXMuc25hcFN0YXR1cy5sb2NrZWQgPSB0aGlzLmRyYWdnaW5nID0gdGhpcy5yZXNpemluZyA9IHRoaXMuZ2VzdHVyaW5nID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnByZXBhcmVkLm5hbWUgPSB0aGlzLnByZXZFdmVudCA9IG51bGw7XG4gICAgICAgICAgICB0aGlzLmluZXJ0aWFTdGF0dXMucmVzdW1lRHggPSB0aGlzLmluZXJ0aWFTdGF0dXMucmVzdW1lRHkgPSAwO1xuXG4gICAgICAgICAgICAvLyByZW1vdmUgcG9pbnRlcnMgaWYgdGhlaXIgSUQgaXNuJ3QgaW4gdGhpcy5wb2ludGVySWRzXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucG9pbnRlcnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBpZiAoaW5kZXhPZih0aGlzLnBvaW50ZXJJZHMsIGdldFBvaW50ZXJJZCh0aGlzLnBvaW50ZXJzW2ldKSkgPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucG9pbnRlcnMuc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBpbmVydGlhRnJhbWU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBpbmVydGlhU3RhdHVzID0gdGhpcy5pbmVydGlhU3RhdHVzLFxuICAgICAgICAgICAgICAgIG9wdGlvbnMgPSB0aGlzLnRhcmdldC5vcHRpb25zW3RoaXMucHJlcGFyZWQubmFtZV0uaW5lcnRpYSxcbiAgICAgICAgICAgICAgICBsYW1iZGEgPSBvcHRpb25zLnJlc2lzdGFuY2UsXG4gICAgICAgICAgICAgICAgdCA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpIC8gMTAwMCAtIGluZXJ0aWFTdGF0dXMudDA7XG5cbiAgICAgICAgICAgIGlmICh0IDwgaW5lcnRpYVN0YXR1cy50ZSkge1xuXG4gICAgICAgICAgICAgICAgdmFyIHByb2dyZXNzID0gIDEgLSAoTWF0aC5leHAoLWxhbWJkYSAqIHQpIC0gaW5lcnRpYVN0YXR1cy5sYW1iZGFfdjApIC8gaW5lcnRpYVN0YXR1cy5vbmVfdmVfdjA7XG5cbiAgICAgICAgICAgICAgICBpZiAoaW5lcnRpYVN0YXR1cy5tb2RpZmllZFhlID09PSBpbmVydGlhU3RhdHVzLnhlICYmIGluZXJ0aWFTdGF0dXMubW9kaWZpZWRZZSA9PT0gaW5lcnRpYVN0YXR1cy55ZSkge1xuICAgICAgICAgICAgICAgICAgICBpbmVydGlhU3RhdHVzLnN4ID0gaW5lcnRpYVN0YXR1cy54ZSAqIHByb2dyZXNzO1xuICAgICAgICAgICAgICAgICAgICBpbmVydGlhU3RhdHVzLnN5ID0gaW5lcnRpYVN0YXR1cy55ZSAqIHByb2dyZXNzO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHF1YWRQb2ludCA9IGdldFF1YWRyYXRpY0N1cnZlUG9pbnQoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgMCwgMCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbmVydGlhU3RhdHVzLnhlLCBpbmVydGlhU3RhdHVzLnllLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMubW9kaWZpZWRYZSwgaW5lcnRpYVN0YXR1cy5tb2RpZmllZFllLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb2dyZXNzKTtcblxuICAgICAgICAgICAgICAgICAgICBpbmVydGlhU3RhdHVzLnN4ID0gcXVhZFBvaW50Lng7XG4gICAgICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMuc3kgPSBxdWFkUG9pbnQueTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0aGlzLnBvaW50ZXJNb3ZlKGluZXJ0aWFTdGF0dXMuc3RhcnRFdmVudCwgaW5lcnRpYVN0YXR1cy5zdGFydEV2ZW50KTtcblxuICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMuaSA9IHJlcUZyYW1lKHRoaXMuYm91bmRJbmVydGlhRnJhbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy5lbmRpbmcgPSB0cnVlO1xuXG4gICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy5zeCA9IGluZXJ0aWFTdGF0dXMubW9kaWZpZWRYZTtcbiAgICAgICAgICAgICAgICBpbmVydGlhU3RhdHVzLnN5ID0gaW5lcnRpYVN0YXR1cy5tb2RpZmllZFllO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5wb2ludGVyTW92ZShpbmVydGlhU3RhdHVzLnN0YXJ0RXZlbnQsIGluZXJ0aWFTdGF0dXMuc3RhcnRFdmVudCk7XG4gICAgICAgICAgICAgICAgdGhpcy5wb2ludGVyRW5kKGluZXJ0aWFTdGF0dXMuc3RhcnRFdmVudCwgaW5lcnRpYVN0YXR1cy5zdGFydEV2ZW50KTtcblxuICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMuYWN0aXZlID0gaW5lcnRpYVN0YXR1cy5lbmRpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBzbW9vdGhFbmRGcmFtZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIGluZXJ0aWFTdGF0dXMgPSB0aGlzLmluZXJ0aWFTdGF0dXMsXG4gICAgICAgICAgICAgICAgdCA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpIC0gaW5lcnRpYVN0YXR1cy50MCxcbiAgICAgICAgICAgICAgICBkdXJhdGlvbiA9IHRoaXMudGFyZ2V0Lm9wdGlvbnNbdGhpcy5wcmVwYXJlZC5uYW1lXS5pbmVydGlhLnNtb290aEVuZER1cmF0aW9uO1xuXG4gICAgICAgICAgICBpZiAodCA8IGR1cmF0aW9uKSB7XG4gICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy5zeCA9IGVhc2VPdXRRdWFkKHQsIDAsIGluZXJ0aWFTdGF0dXMueGUsIGR1cmF0aW9uKTtcbiAgICAgICAgICAgICAgICBpbmVydGlhU3RhdHVzLnN5ID0gZWFzZU91dFF1YWQodCwgMCwgaW5lcnRpYVN0YXR1cy55ZSwgZHVyYXRpb24pO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5wb2ludGVyTW92ZShpbmVydGlhU3RhdHVzLnN0YXJ0RXZlbnQsIGluZXJ0aWFTdGF0dXMuc3RhcnRFdmVudCk7XG5cbiAgICAgICAgICAgICAgICBpbmVydGlhU3RhdHVzLmkgPSByZXFGcmFtZSh0aGlzLmJvdW5kU21vb3RoRW5kRnJhbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy5lbmRpbmcgPSB0cnVlO1xuXG4gICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy5zeCA9IGluZXJ0aWFTdGF0dXMueGU7XG4gICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy5zeSA9IGluZXJ0aWFTdGF0dXMueWU7XG5cbiAgICAgICAgICAgICAgICB0aGlzLnBvaW50ZXJNb3ZlKGluZXJ0aWFTdGF0dXMuc3RhcnRFdmVudCwgaW5lcnRpYVN0YXR1cy5zdGFydEV2ZW50KTtcbiAgICAgICAgICAgICAgICB0aGlzLnBvaW50ZXJFbmQoaW5lcnRpYVN0YXR1cy5zdGFydEV2ZW50LCBpbmVydGlhU3RhdHVzLnN0YXJ0RXZlbnQpO1xuXG4gICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy5zbW9vdGhFbmQgPVxuICAgICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy5hY3RpdmUgPSBpbmVydGlhU3RhdHVzLmVuZGluZyA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIGFkZFBvaW50ZXI6IGZ1bmN0aW9uIChwb2ludGVyKSB7XG4gICAgICAgICAgICB2YXIgaWQgPSBnZXRQb2ludGVySWQocG9pbnRlciksXG4gICAgICAgICAgICAgICAgaW5kZXggPSB0aGlzLm1vdXNlPyAwIDogaW5kZXhPZih0aGlzLnBvaW50ZXJJZHMsIGlkKTtcblxuICAgICAgICAgICAgaWYgKGluZGV4ID09PSAtMSkge1xuICAgICAgICAgICAgICAgIGluZGV4ID0gdGhpcy5wb2ludGVySWRzLmxlbmd0aDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5wb2ludGVySWRzW2luZGV4XSA9IGlkO1xuICAgICAgICAgICAgdGhpcy5wb2ludGVyc1tpbmRleF0gPSBwb2ludGVyO1xuXG4gICAgICAgICAgICByZXR1cm4gaW5kZXg7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcmVtb3ZlUG9pbnRlcjogZnVuY3Rpb24gKHBvaW50ZXIpIHtcbiAgICAgICAgICAgIHZhciBpZCA9IGdldFBvaW50ZXJJZChwb2ludGVyKSxcbiAgICAgICAgICAgICAgICBpbmRleCA9IHRoaXMubW91c2U/IDAgOiBpbmRleE9mKHRoaXMucG9pbnRlcklkcywgaWQpO1xuXG4gICAgICAgICAgICBpZiAoaW5kZXggPT09IC0xKSB7IHJldHVybjsgfVxuXG4gICAgICAgICAgICB0aGlzLnBvaW50ZXJzICAgLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgICAgICB0aGlzLnBvaW50ZXJJZHMgLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgICAgICB0aGlzLmRvd25UYXJnZXRzLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgICAgICB0aGlzLmRvd25UaW1lcyAgLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgICAgICB0aGlzLmhvbGRUaW1lcnMgLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcmVjb3JkUG9pbnRlcjogZnVuY3Rpb24gKHBvaW50ZXIpIHtcbiAgICAgICAgICAgIHZhciBpbmRleCA9IHRoaXMubW91c2U/IDA6IGluZGV4T2YodGhpcy5wb2ludGVySWRzLCBnZXRQb2ludGVySWQocG9pbnRlcikpO1xuXG4gICAgICAgICAgICBpZiAoaW5kZXggPT09IC0xKSB7IHJldHVybjsgfVxuXG4gICAgICAgICAgICB0aGlzLnBvaW50ZXJzW2luZGV4XSA9IHBvaW50ZXI7XG4gICAgICAgIH0sXG5cbiAgICAgICAgY29sbGVjdEV2ZW50VGFyZ2V0czogZnVuY3Rpb24gKHBvaW50ZXIsIGV2ZW50LCBldmVudFRhcmdldCwgZXZlbnRUeXBlKSB7XG4gICAgICAgICAgICB2YXIgcG9pbnRlckluZGV4ID0gdGhpcy5tb3VzZT8gMCA6IGluZGV4T2YodGhpcy5wb2ludGVySWRzLCBnZXRQb2ludGVySWQocG9pbnRlcikpO1xuXG4gICAgICAgICAgICAvLyBkbyBub3QgZmlyZSBhIHRhcCBldmVudCBpZiB0aGUgcG9pbnRlciB3YXMgbW92ZWQgYmVmb3JlIGJlaW5nIGxpZnRlZFxuICAgICAgICAgICAgaWYgKGV2ZW50VHlwZSA9PT0gJ3RhcCcgJiYgKHRoaXMucG9pbnRlcldhc01vdmVkXG4gICAgICAgICAgICAgICAgLy8gb3IgaWYgdGhlIHBvaW50ZXJ1cCB0YXJnZXQgaXMgZGlmZmVyZW50IHRvIHRoZSBwb2ludGVyZG93biB0YXJnZXRcbiAgICAgICAgICAgICAgICB8fCAhKHRoaXMuZG93blRhcmdldHNbcG9pbnRlckluZGV4XSAmJiB0aGlzLmRvd25UYXJnZXRzW3BvaW50ZXJJbmRleF0gPT09IGV2ZW50VGFyZ2V0KSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciB0YXJnZXRzID0gW10sXG4gICAgICAgICAgICAgICAgZWxlbWVudHMgPSBbXSxcbiAgICAgICAgICAgICAgICBlbGVtZW50ID0gZXZlbnRUYXJnZXQ7XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGNvbGxlY3RTZWxlY3RvcnMgKGludGVyYWN0YWJsZSwgc2VsZWN0b3IsIGNvbnRleHQpIHtcbiAgICAgICAgICAgICAgICB2YXIgZWxzID0gaWU4TWF0Y2hlc1NlbGVjdG9yXG4gICAgICAgICAgICAgICAgICAgICAgICA/IGNvbnRleHQucXVlcnlTZWxlY3RvckFsbChzZWxlY3RvcilcbiAgICAgICAgICAgICAgICAgICAgICAgIDogdW5kZWZpbmVkO1xuXG4gICAgICAgICAgICAgICAgaWYgKGludGVyYWN0YWJsZS5faUV2ZW50c1tldmVudFR5cGVdXG4gICAgICAgICAgICAgICAgICAgICYmIGlzRWxlbWVudChlbGVtZW50KVxuICAgICAgICAgICAgICAgICAgICAmJiBpbkNvbnRleHQoaW50ZXJhY3RhYmxlLCBlbGVtZW50KVxuICAgICAgICAgICAgICAgICAgICAmJiAhdGVzdElnbm9yZShpbnRlcmFjdGFibGUsIGVsZW1lbnQsIGV2ZW50VGFyZ2V0KVxuICAgICAgICAgICAgICAgICAgICAmJiB0ZXN0QWxsb3coaW50ZXJhY3RhYmxlLCBlbGVtZW50LCBldmVudFRhcmdldClcbiAgICAgICAgICAgICAgICAgICAgJiYgbWF0Y2hlc1NlbGVjdG9yKGVsZW1lbnQsIHNlbGVjdG9yLCBlbHMpKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0cy5wdXNoKGludGVyYWN0YWJsZSk7XG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB3aGlsZSAoZWxlbWVudCkge1xuICAgICAgICAgICAgICAgIGlmIChpbnRlcmFjdC5pc1NldChlbGVtZW50KSAmJiBpbnRlcmFjdChlbGVtZW50KS5faUV2ZW50c1tldmVudFR5cGVdKSB7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldHMucHVzaChpbnRlcmFjdChlbGVtZW50KSk7XG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaW50ZXJhY3RhYmxlcy5mb3JFYWNoU2VsZWN0b3IoY29sbGVjdFNlbGVjdG9ycyk7XG5cbiAgICAgICAgICAgICAgICBlbGVtZW50ID0gcGFyZW50RWxlbWVudChlbGVtZW50KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gY3JlYXRlIHRoZSB0YXAgZXZlbnQgZXZlbiBpZiB0aGVyZSBhcmUgbm8gbGlzdGVuZXJzIHNvIHRoYXRcbiAgICAgICAgICAgIC8vIGRvdWJsZXRhcCBjYW4gc3RpbGwgYmUgY3JlYXRlZCBhbmQgZmlyZWRcbiAgICAgICAgICAgIGlmICh0YXJnZXRzLmxlbmd0aCB8fCBldmVudFR5cGUgPT09ICd0YXAnKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5maXJlUG9pbnRlcnMocG9pbnRlciwgZXZlbnQsIGV2ZW50VGFyZ2V0LCB0YXJnZXRzLCBlbGVtZW50cywgZXZlbnRUeXBlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBmaXJlUG9pbnRlcnM6IGZ1bmN0aW9uIChwb2ludGVyLCBldmVudCwgZXZlbnRUYXJnZXQsIHRhcmdldHMsIGVsZW1lbnRzLCBldmVudFR5cGUpIHtcbiAgICAgICAgICAgIHZhciBwb2ludGVySW5kZXggPSB0aGlzLm1vdXNlPyAwIDogaW5kZXhPZih0aGlzLnBvaW50ZXJJZHMsIGdldFBvaW50ZXJJZChwb2ludGVyKSksXG4gICAgICAgICAgICAgICAgcG9pbnRlckV2ZW50ID0ge30sXG4gICAgICAgICAgICAgICAgaSxcbiAgICAgICAgICAgICAgICAvLyBmb3IgdGFwIGV2ZW50c1xuICAgICAgICAgICAgICAgIGludGVydmFsLCBjcmVhdGVOZXdEb3VibGVUYXA7XG5cbiAgICAgICAgICAgIC8vIGlmIGl0J3MgYSBkb3VibGV0YXAgdGhlbiB0aGUgZXZlbnQgcHJvcGVydGllcyB3b3VsZCBoYXZlIGJlZW5cbiAgICAgICAgICAgIC8vIGNvcGllZCBmcm9tIHRoZSB0YXAgZXZlbnQgYW5kIHByb3ZpZGVkIGFzIHRoZSBwb2ludGVyIGFyZ3VtZW50XG4gICAgICAgICAgICBpZiAoZXZlbnRUeXBlID09PSAnZG91YmxldGFwJykge1xuICAgICAgICAgICAgICAgIHBvaW50ZXJFdmVudCA9IHBvaW50ZXI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBwb2ludGVyRXh0ZW5kKHBvaW50ZXJFdmVudCwgZXZlbnQpO1xuICAgICAgICAgICAgICAgIGlmIChldmVudCAhPT0gcG9pbnRlcikge1xuICAgICAgICAgICAgICAgICAgICBwb2ludGVyRXh0ZW5kKHBvaW50ZXJFdmVudCwgcG9pbnRlcik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcG9pbnRlckV2ZW50LnByZXZlbnREZWZhdWx0ICAgICAgICAgICA9IHByZXZlbnRPcmlnaW5hbERlZmF1bHQ7XG4gICAgICAgICAgICAgICAgcG9pbnRlckV2ZW50LnN0b3BQcm9wYWdhdGlvbiAgICAgICAgICA9IEludGVyYWN0RXZlbnQucHJvdG90eXBlLnN0b3BQcm9wYWdhdGlvbjtcbiAgICAgICAgICAgICAgICBwb2ludGVyRXZlbnQuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uID0gSW50ZXJhY3RFdmVudC5wcm90b3R5cGUuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uO1xuICAgICAgICAgICAgICAgIHBvaW50ZXJFdmVudC5pbnRlcmFjdGlvbiAgICAgICAgICAgICAgPSB0aGlzO1xuXG4gICAgICAgICAgICAgICAgcG9pbnRlckV2ZW50LnRpbWVTdGFtcCAgICAgICA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgICAgICAgICAgICAgIHBvaW50ZXJFdmVudC5vcmlnaW5hbEV2ZW50ICAgPSBldmVudDtcbiAgICAgICAgICAgICAgICBwb2ludGVyRXZlbnQub3JpZ2luYWxQb2ludGVyID0gcG9pbnRlcjtcbiAgICAgICAgICAgICAgICBwb2ludGVyRXZlbnQudHlwZSAgICAgICAgICAgID0gZXZlbnRUeXBlO1xuICAgICAgICAgICAgICAgIHBvaW50ZXJFdmVudC5wb2ludGVySWQgICAgICAgPSBnZXRQb2ludGVySWQocG9pbnRlcik7XG4gICAgICAgICAgICAgICAgcG9pbnRlckV2ZW50LnBvaW50ZXJUeXBlICAgICA9IHRoaXMubW91c2U/ICdtb3VzZScgOiAhc3VwcG9ydHNQb2ludGVyRXZlbnQ/ICd0b3VjaCdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA6IGlzU3RyaW5nKHBvaW50ZXIucG9pbnRlclR5cGUpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgID8gcG9pbnRlci5wb2ludGVyVHlwZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA6IFssLCd0b3VjaCcsICdwZW4nLCAnbW91c2UnXVtwb2ludGVyLnBvaW50ZXJUeXBlXTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGV2ZW50VHlwZSA9PT0gJ3RhcCcpIHtcbiAgICAgICAgICAgICAgICBwb2ludGVyRXZlbnQuZHQgPSBwb2ludGVyRXZlbnQudGltZVN0YW1wIC0gdGhpcy5kb3duVGltZXNbcG9pbnRlckluZGV4XTtcblxuICAgICAgICAgICAgICAgIGludGVydmFsID0gcG9pbnRlckV2ZW50LnRpbWVTdGFtcCAtIHRoaXMudGFwVGltZTtcbiAgICAgICAgICAgICAgICBjcmVhdGVOZXdEb3VibGVUYXAgPSAhISh0aGlzLnByZXZUYXAgJiYgdGhpcy5wcmV2VGFwLnR5cGUgIT09ICdkb3VibGV0YXAnXG4gICAgICAgICAgICAgICAgICAgICAgICYmIHRoaXMucHJldlRhcC50YXJnZXQgPT09IHBvaW50ZXJFdmVudC50YXJnZXRcbiAgICAgICAgICAgICAgICAgICAgICAgJiYgaW50ZXJ2YWwgPCA1MDApO1xuXG4gICAgICAgICAgICAgICAgcG9pbnRlckV2ZW50LmRvdWJsZSA9IGNyZWF0ZU5ld0RvdWJsZVRhcDtcblxuICAgICAgICAgICAgICAgIHRoaXMudGFwVGltZSA9IHBvaW50ZXJFdmVudC50aW1lU3RhbXA7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCB0YXJnZXRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgcG9pbnRlckV2ZW50LmN1cnJlbnRUYXJnZXQgPSBlbGVtZW50c1tpXTtcbiAgICAgICAgICAgICAgICBwb2ludGVyRXZlbnQuaW50ZXJhY3RhYmxlID0gdGFyZ2V0c1tpXTtcbiAgICAgICAgICAgICAgICB0YXJnZXRzW2ldLmZpcmUocG9pbnRlckV2ZW50KTtcblxuICAgICAgICAgICAgICAgIGlmIChwb2ludGVyRXZlbnQuaW1tZWRpYXRlUHJvcGFnYXRpb25TdG9wcGVkXG4gICAgICAgICAgICAgICAgICAgIHx8KHBvaW50ZXJFdmVudC5wcm9wYWdhdGlvblN0b3BwZWQgJiYgZWxlbWVudHNbaSArIDFdICE9PSBwb2ludGVyRXZlbnQuY3VycmVudFRhcmdldCkpIHtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoY3JlYXRlTmV3RG91YmxlVGFwKSB7XG4gICAgICAgICAgICAgICAgdmFyIGRvdWJsZVRhcCA9IHt9O1xuXG4gICAgICAgICAgICAgICAgZXh0ZW5kKGRvdWJsZVRhcCwgcG9pbnRlckV2ZW50KTtcblxuICAgICAgICAgICAgICAgIGRvdWJsZVRhcC5kdCAgID0gaW50ZXJ2YWw7XG4gICAgICAgICAgICAgICAgZG91YmxlVGFwLnR5cGUgPSAnZG91YmxldGFwJztcblxuICAgICAgICAgICAgICAgIHRoaXMuY29sbGVjdEV2ZW50VGFyZ2V0cyhkb3VibGVUYXAsIGV2ZW50LCBldmVudFRhcmdldCwgJ2RvdWJsZXRhcCcpO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5wcmV2VGFwID0gZG91YmxlVGFwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoZXZlbnRUeXBlID09PSAndGFwJykge1xuICAgICAgICAgICAgICAgIHRoaXMucHJldlRhcCA9IHBvaW50ZXJFdmVudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICB2YWxpZGF0ZVNlbGVjdG9yOiBmdW5jdGlvbiAocG9pbnRlciwgZXZlbnQsIG1hdGNoZXMsIG1hdGNoRWxlbWVudHMpIHtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBtYXRjaGVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgdmFyIG1hdGNoID0gbWF0Y2hlc1tpXSxcbiAgICAgICAgICAgICAgICAgICAgbWF0Y2hFbGVtZW50ID0gbWF0Y2hFbGVtZW50c1tpXSxcbiAgICAgICAgICAgICAgICAgICAgYWN0aW9uID0gdmFsaWRhdGVBY3Rpb24obWF0Y2guZ2V0QWN0aW9uKHBvaW50ZXIsIGV2ZW50LCB0aGlzLCBtYXRjaEVsZW1lbnQpLCBtYXRjaCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoYWN0aW9uICYmIHdpdGhpbkludGVyYWN0aW9uTGltaXQobWF0Y2gsIG1hdGNoRWxlbWVudCwgYWN0aW9uKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnRhcmdldCA9IG1hdGNoO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmVsZW1lbnQgPSBtYXRjaEVsZW1lbnQ7XG5cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGFjdGlvbjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgc2V0U25hcHBpbmc6IGZ1bmN0aW9uIChwYWdlQ29vcmRzLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIHZhciBzbmFwID0gdGhpcy50YXJnZXQub3B0aW9uc1t0aGlzLnByZXBhcmVkLm5hbWVdLnNuYXAsXG4gICAgICAgICAgICAgICAgdGFyZ2V0cyA9IFtdLFxuICAgICAgICAgICAgICAgIHRhcmdldCxcbiAgICAgICAgICAgICAgICBwYWdlLFxuICAgICAgICAgICAgICAgIGk7XG5cbiAgICAgICAgICAgIHN0YXR1cyA9IHN0YXR1cyB8fCB0aGlzLnNuYXBTdGF0dXM7XG5cbiAgICAgICAgICAgIGlmIChzdGF0dXMudXNlU3RhdHVzWFkpIHtcbiAgICAgICAgICAgICAgICBwYWdlID0geyB4OiBzdGF0dXMueCwgeTogc3RhdHVzLnkgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBvcmlnaW4gPSBnZXRPcmlnaW5YWSh0aGlzLnRhcmdldCwgdGhpcy5lbGVtZW50KTtcblxuICAgICAgICAgICAgICAgIHBhZ2UgPSBleHRlbmQoe30sIHBhZ2VDb29yZHMpO1xuXG4gICAgICAgICAgICAgICAgcGFnZS54IC09IG9yaWdpbi54O1xuICAgICAgICAgICAgICAgIHBhZ2UueSAtPSBvcmlnaW4ueTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgc3RhdHVzLnJlYWxYID0gcGFnZS54O1xuICAgICAgICAgICAgc3RhdHVzLnJlYWxZID0gcGFnZS55O1xuXG4gICAgICAgICAgICBwYWdlLnggPSBwYWdlLnggLSB0aGlzLmluZXJ0aWFTdGF0dXMucmVzdW1lRHg7XG4gICAgICAgICAgICBwYWdlLnkgPSBwYWdlLnkgLSB0aGlzLmluZXJ0aWFTdGF0dXMucmVzdW1lRHk7XG5cbiAgICAgICAgICAgIHZhciBsZW4gPSBzbmFwLnRhcmdldHM/IHNuYXAudGFyZ2V0cy5sZW5ndGggOiAwO1xuXG4gICAgICAgICAgICBmb3IgKHZhciByZWxJbmRleCA9IDA7IHJlbEluZGV4IDwgdGhpcy5zbmFwT2Zmc2V0cy5sZW5ndGg7IHJlbEluZGV4KyspIHtcbiAgICAgICAgICAgICAgICB2YXIgcmVsYXRpdmUgPSB7XG4gICAgICAgICAgICAgICAgICAgIHg6IHBhZ2UueCAtIHRoaXMuc25hcE9mZnNldHNbcmVsSW5kZXhdLngsXG4gICAgICAgICAgICAgICAgICAgIHk6IHBhZ2UueSAtIHRoaXMuc25hcE9mZnNldHNbcmVsSW5kZXhdLnlcbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpc0Z1bmN0aW9uKHNuYXAudGFyZ2V0c1tpXSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldCA9IHNuYXAudGFyZ2V0c1tpXShyZWxhdGl2ZS54LCByZWxhdGl2ZS55LCB0aGlzKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldCA9IHNuYXAudGFyZ2V0c1tpXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlmICghdGFyZ2V0KSB7IGNvbnRpbnVlOyB9XG5cbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0cy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHg6IGlzTnVtYmVyKHRhcmdldC54KSA/ICh0YXJnZXQueCArIHRoaXMuc25hcE9mZnNldHNbcmVsSW5kZXhdLngpIDogcmVsYXRpdmUueCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHk6IGlzTnVtYmVyKHRhcmdldC55KSA/ICh0YXJnZXQueSArIHRoaXMuc25hcE9mZnNldHNbcmVsSW5kZXhdLnkpIDogcmVsYXRpdmUueSxcblxuICAgICAgICAgICAgICAgICAgICAgICAgcmFuZ2U6IGlzTnVtYmVyKHRhcmdldC5yYW5nZSk/IHRhcmdldC5yYW5nZTogc25hcC5yYW5nZVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBjbG9zZXN0ID0ge1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQ6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIGluUmFuZ2U6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBkaXN0YW5jZTogMCxcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2U6IDAsXG4gICAgICAgICAgICAgICAgICAgIGR4OiAwLFxuICAgICAgICAgICAgICAgICAgICBkeTogMFxuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGZvciAoaSA9IDAsIGxlbiA9IHRhcmdldHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgICAgICB0YXJnZXQgPSB0YXJnZXRzW2ldO1xuXG4gICAgICAgICAgICAgICAgdmFyIHJhbmdlID0gdGFyZ2V0LnJhbmdlLFxuICAgICAgICAgICAgICAgICAgICBkeCA9IHRhcmdldC54IC0gcGFnZS54LFxuICAgICAgICAgICAgICAgICAgICBkeSA9IHRhcmdldC55IC0gcGFnZS55LFxuICAgICAgICAgICAgICAgICAgICBkaXN0YW5jZSA9IGh5cG90KGR4LCBkeSksXG4gICAgICAgICAgICAgICAgICAgIGluUmFuZ2UgPSBkaXN0YW5jZSA8PSByYW5nZTtcblxuICAgICAgICAgICAgICAgIC8vIEluZmluaXRlIHRhcmdldHMgY291bnQgYXMgYmVpbmcgb3V0IG9mIHJhbmdlXG4gICAgICAgICAgICAgICAgLy8gY29tcGFyZWQgdG8gbm9uIGluZmluaXRlIG9uZXMgdGhhdCBhcmUgaW4gcmFuZ2VcbiAgICAgICAgICAgICAgICBpZiAocmFuZ2UgPT09IEluZmluaXR5ICYmIGNsb3Nlc3QuaW5SYW5nZSAmJiBjbG9zZXN0LnJhbmdlICE9PSBJbmZpbml0eSkge1xuICAgICAgICAgICAgICAgICAgICBpblJhbmdlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKCFjbG9zZXN0LnRhcmdldCB8fCAoaW5SYW5nZVxuICAgICAgICAgICAgICAgICAgICAvLyBpcyB0aGUgY2xvc2VzdCB0YXJnZXQgaW4gcmFuZ2U/XG4gICAgICAgICAgICAgICAgICAgID8gKGNsb3Nlc3QuaW5SYW5nZSAmJiByYW5nZSAhPT0gSW5maW5pdHlcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoZSBwb2ludGVyIGlzIHJlbGF0aXZlbHkgZGVlcGVyIGluIHRoaXMgdGFyZ2V0XG4gICAgICAgICAgICAgICAgICAgICAgICA/IGRpc3RhbmNlIC8gcmFuZ2UgPCBjbG9zZXN0LmRpc3RhbmNlIC8gY2xvc2VzdC5yYW5nZVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGhpcyB0YXJnZXQgaGFzIEluZmluaXRlIHJhbmdlIGFuZCB0aGUgY2xvc2VzdCBkb2Vzbid0XG4gICAgICAgICAgICAgICAgICAgICAgICA6IChyYW5nZSA9PT0gSW5maW5pdHkgJiYgY2xvc2VzdC5yYW5nZSAhPT0gSW5maW5pdHkpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gT1IgdGhpcyB0YXJnZXQgaXMgY2xvc2VyIHRoYXQgdGhlIHByZXZpb3VzIGNsb3Nlc3RcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB8fCBkaXN0YW5jZSA8IGNsb3Nlc3QuZGlzdGFuY2UpXG4gICAgICAgICAgICAgICAgICAgIC8vIFRoZSBvdGhlciBpcyBub3QgaW4gcmFuZ2UgYW5kIHRoZSBwb2ludGVyIGlzIGNsb3NlciB0byB0aGlzIHRhcmdldFxuICAgICAgICAgICAgICAgICAgICA6ICghY2xvc2VzdC5pblJhbmdlICYmIGRpc3RhbmNlIDwgY2xvc2VzdC5kaXN0YW5jZSkpKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHJhbmdlID09PSBJbmZpbml0eSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaW5SYW5nZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBjbG9zZXN0LnRhcmdldCA9IHRhcmdldDtcbiAgICAgICAgICAgICAgICAgICAgY2xvc2VzdC5kaXN0YW5jZSA9IGRpc3RhbmNlO1xuICAgICAgICAgICAgICAgICAgICBjbG9zZXN0LnJhbmdlID0gcmFuZ2U7XG4gICAgICAgICAgICAgICAgICAgIGNsb3Nlc3QuaW5SYW5nZSA9IGluUmFuZ2U7XG4gICAgICAgICAgICAgICAgICAgIGNsb3Nlc3QuZHggPSBkeDtcbiAgICAgICAgICAgICAgICAgICAgY2xvc2VzdC5keSA9IGR5O1xuXG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5yYW5nZSA9IHJhbmdlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHNuYXBDaGFuZ2VkO1xuXG4gICAgICAgICAgICBpZiAoY2xvc2VzdC50YXJnZXQpIHtcbiAgICAgICAgICAgICAgICBzbmFwQ2hhbmdlZCA9IChzdGF0dXMuc25hcHBlZFggIT09IGNsb3Nlc3QudGFyZ2V0LnggfHwgc3RhdHVzLnNuYXBwZWRZICE9PSBjbG9zZXN0LnRhcmdldC55KTtcblxuICAgICAgICAgICAgICAgIHN0YXR1cy5zbmFwcGVkWCA9IGNsb3Nlc3QudGFyZ2V0Lng7XG4gICAgICAgICAgICAgICAgc3RhdHVzLnNuYXBwZWRZID0gY2xvc2VzdC50YXJnZXQueTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHNuYXBDaGFuZ2VkID0gdHJ1ZTtcblxuICAgICAgICAgICAgICAgIHN0YXR1cy5zbmFwcGVkWCA9IE5hTjtcbiAgICAgICAgICAgICAgICBzdGF0dXMuc25hcHBlZFkgPSBOYU47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHN0YXR1cy5keCA9IGNsb3Nlc3QuZHg7XG4gICAgICAgICAgICBzdGF0dXMuZHkgPSBjbG9zZXN0LmR5O1xuXG4gICAgICAgICAgICBzdGF0dXMuY2hhbmdlZCA9IChzbmFwQ2hhbmdlZCB8fCAoY2xvc2VzdC5pblJhbmdlICYmICFzdGF0dXMubG9ja2VkKSk7XG4gICAgICAgICAgICBzdGF0dXMubG9ja2VkID0gY2xvc2VzdC5pblJhbmdlO1xuXG4gICAgICAgICAgICByZXR1cm4gc3RhdHVzO1xuICAgICAgICB9LFxuXG4gICAgICAgIHNldFJlc3RyaWN0aW9uOiBmdW5jdGlvbiAocGFnZUNvb3Jkcywgc3RhdHVzKSB7XG4gICAgICAgICAgICB2YXIgdGFyZ2V0ID0gdGhpcy50YXJnZXQsXG4gICAgICAgICAgICAgICAgcmVzdHJpY3QgPSB0YXJnZXQgJiYgdGFyZ2V0Lm9wdGlvbnNbdGhpcy5wcmVwYXJlZC5uYW1lXS5yZXN0cmljdCxcbiAgICAgICAgICAgICAgICByZXN0cmljdGlvbiA9IHJlc3RyaWN0ICYmIHJlc3RyaWN0LnJlc3RyaWN0aW9uLFxuICAgICAgICAgICAgICAgIHBhZ2U7XG5cbiAgICAgICAgICAgIGlmICghcmVzdHJpY3Rpb24pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc3RhdHVzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBzdGF0dXMgPSBzdGF0dXMgfHwgdGhpcy5yZXN0cmljdFN0YXR1cztcblxuICAgICAgICAgICAgcGFnZSA9IHN0YXR1cy51c2VTdGF0dXNYWVxuICAgICAgICAgICAgICAgICAgICA/IHBhZ2UgPSB7IHg6IHN0YXR1cy54LCB5OiBzdGF0dXMueSB9XG4gICAgICAgICAgICAgICAgICAgIDogcGFnZSA9IGV4dGVuZCh7fSwgcGFnZUNvb3Jkcyk7XG5cbiAgICAgICAgICAgIGlmIChzdGF0dXMuc25hcCAmJiBzdGF0dXMuc25hcC5sb2NrZWQpIHtcbiAgICAgICAgICAgICAgICBwYWdlLnggKz0gc3RhdHVzLnNuYXAuZHggfHwgMDtcbiAgICAgICAgICAgICAgICBwYWdlLnkgKz0gc3RhdHVzLnNuYXAuZHkgfHwgMDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcGFnZS54IC09IHRoaXMuaW5lcnRpYVN0YXR1cy5yZXN1bWVEeDtcbiAgICAgICAgICAgIHBhZ2UueSAtPSB0aGlzLmluZXJ0aWFTdGF0dXMucmVzdW1lRHk7XG5cbiAgICAgICAgICAgIHN0YXR1cy5keCA9IDA7XG4gICAgICAgICAgICBzdGF0dXMuZHkgPSAwO1xuICAgICAgICAgICAgc3RhdHVzLnJlc3RyaWN0ZWQgPSBmYWxzZTtcblxuICAgICAgICAgICAgdmFyIHJlY3QsIHJlc3RyaWN0ZWRYLCByZXN0cmljdGVkWTtcblxuICAgICAgICAgICAgaWYgKGlzU3RyaW5nKHJlc3RyaWN0aW9uKSkge1xuICAgICAgICAgICAgICAgIGlmIChyZXN0cmljdGlvbiA9PT0gJ3BhcmVudCcpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdHJpY3Rpb24gPSBwYXJlbnRFbGVtZW50KHRoaXMuZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKHJlc3RyaWN0aW9uID09PSAnc2VsZicpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdHJpY3Rpb24gPSB0YXJnZXQuZ2V0UmVjdCh0aGlzLmVsZW1lbnQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdHJpY3Rpb24gPSBjbG9zZXN0KHRoaXMuZWxlbWVudCwgcmVzdHJpY3Rpb24pO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICghcmVzdHJpY3Rpb24pIHsgcmV0dXJuIHN0YXR1czsgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoaXNGdW5jdGlvbihyZXN0cmljdGlvbikpIHtcbiAgICAgICAgICAgICAgICByZXN0cmljdGlvbiA9IHJlc3RyaWN0aW9uKHBhZ2UueCwgcGFnZS55LCB0aGlzLmVsZW1lbnQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoaXNFbGVtZW50KHJlc3RyaWN0aW9uKSkge1xuICAgICAgICAgICAgICAgIHJlc3RyaWN0aW9uID0gZ2V0RWxlbWVudFJlY3QocmVzdHJpY3Rpb24pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZWN0ID0gcmVzdHJpY3Rpb247XG5cbiAgICAgICAgICAgIGlmICghcmVzdHJpY3Rpb24pIHtcbiAgICAgICAgICAgICAgICByZXN0cmljdGVkWCA9IHBhZ2UueDtcbiAgICAgICAgICAgICAgICByZXN0cmljdGVkWSA9IHBhZ2UueTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIG9iamVjdCBpcyBhc3N1bWVkIHRvIGhhdmVcbiAgICAgICAgICAgIC8vIHgsIHksIHdpZHRoLCBoZWlnaHQgb3JcbiAgICAgICAgICAgIC8vIGxlZnQsIHRvcCwgcmlnaHQsIGJvdHRvbVxuICAgICAgICAgICAgZWxzZSBpZiAoJ3gnIGluIHJlc3RyaWN0aW9uICYmICd5JyBpbiByZXN0cmljdGlvbikge1xuICAgICAgICAgICAgICAgIHJlc3RyaWN0ZWRYID0gTWF0aC5tYXgoTWF0aC5taW4ocmVjdC54ICsgcmVjdC53aWR0aCAgLSB0aGlzLnJlc3RyaWN0T2Zmc2V0LnJpZ2h0ICwgcGFnZS54KSwgcmVjdC54ICsgdGhpcy5yZXN0cmljdE9mZnNldC5sZWZ0KTtcbiAgICAgICAgICAgICAgICByZXN0cmljdGVkWSA9IE1hdGgubWF4KE1hdGgubWluKHJlY3QueSArIHJlY3QuaGVpZ2h0IC0gdGhpcy5yZXN0cmljdE9mZnNldC5ib3R0b20sIHBhZ2UueSksIHJlY3QueSArIHRoaXMucmVzdHJpY3RPZmZzZXQudG9wICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXN0cmljdGVkWCA9IE1hdGgubWF4KE1hdGgubWluKHJlY3QucmlnaHQgIC0gdGhpcy5yZXN0cmljdE9mZnNldC5yaWdodCAsIHBhZ2UueCksIHJlY3QubGVmdCArIHRoaXMucmVzdHJpY3RPZmZzZXQubGVmdCk7XG4gICAgICAgICAgICAgICAgcmVzdHJpY3RlZFkgPSBNYXRoLm1heChNYXRoLm1pbihyZWN0LmJvdHRvbSAtIHRoaXMucmVzdHJpY3RPZmZzZXQuYm90dG9tLCBwYWdlLnkpLCByZWN0LnRvcCAgKyB0aGlzLnJlc3RyaWN0T2Zmc2V0LnRvcCApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBzdGF0dXMuZHggPSByZXN0cmljdGVkWCAtIHBhZ2UueDtcbiAgICAgICAgICAgIHN0YXR1cy5keSA9IHJlc3RyaWN0ZWRZIC0gcGFnZS55O1xuXG4gICAgICAgICAgICBzdGF0dXMuY2hhbmdlZCA9IHN0YXR1cy5yZXN0cmljdGVkWCAhPT0gcmVzdHJpY3RlZFggfHwgc3RhdHVzLnJlc3RyaWN0ZWRZICE9PSByZXN0cmljdGVkWTtcbiAgICAgICAgICAgIHN0YXR1cy5yZXN0cmljdGVkID0gISEoc3RhdHVzLmR4IHx8IHN0YXR1cy5keSk7XG5cbiAgICAgICAgICAgIHN0YXR1cy5yZXN0cmljdGVkWCA9IHJlc3RyaWN0ZWRYO1xuICAgICAgICAgICAgc3RhdHVzLnJlc3RyaWN0ZWRZID0gcmVzdHJpY3RlZFk7XG5cbiAgICAgICAgICAgIHJldHVybiBzdGF0dXM7XG4gICAgICAgIH0sXG5cbiAgICAgICAgY2hlY2tBbmRQcmV2ZW50RGVmYXVsdDogZnVuY3Rpb24gKGV2ZW50LCBpbnRlcmFjdGFibGUsIGVsZW1lbnQpIHtcbiAgICAgICAgICAgIGlmICghKGludGVyYWN0YWJsZSA9IGludGVyYWN0YWJsZSB8fCB0aGlzLnRhcmdldCkpIHsgcmV0dXJuOyB9XG5cbiAgICAgICAgICAgIHZhciBvcHRpb25zID0gaW50ZXJhY3RhYmxlLm9wdGlvbnMsXG4gICAgICAgICAgICAgICAgcHJldmVudCA9IG9wdGlvbnMucHJldmVudERlZmF1bHQ7XG5cbiAgICAgICAgICAgIGlmIChwcmV2ZW50ID09PSAnYXV0bycgJiYgZWxlbWVudCAmJiAhL14oaW5wdXR8c2VsZWN0fHRleHRhcmVhKSQvaS50ZXN0KGV2ZW50LnRhcmdldC5ub2RlTmFtZSkpIHtcbiAgICAgICAgICAgICAgICAvLyBkbyBub3QgcHJldmVudERlZmF1bHQgb24gcG9pbnRlcmRvd24gaWYgdGhlIHByZXBhcmVkIGFjdGlvbiBpcyBhIGRyYWdcbiAgICAgICAgICAgICAgICAvLyBhbmQgZHJhZ2dpbmcgY2FuIG9ubHkgc3RhcnQgZnJvbSBhIGNlcnRhaW4gZGlyZWN0aW9uIC0gdGhpcyBhbGxvd3NcbiAgICAgICAgICAgICAgICAvLyBhIHRvdWNoIHRvIHBhbiB0aGUgdmlld3BvcnQgaWYgYSBkcmFnIGlzbid0IGluIHRoZSByaWdodCBkaXJlY3Rpb25cbiAgICAgICAgICAgICAgICBpZiAoL2Rvd258c3RhcnQvaS50ZXN0KGV2ZW50LnR5cGUpXG4gICAgICAgICAgICAgICAgICAgICYmIHRoaXMucHJlcGFyZWQubmFtZSA9PT0gJ2RyYWcnICYmIG9wdGlvbnMuZHJhZy5heGlzICE9PSAneHknKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIHdpdGggbWFudWFsU3RhcnQsIG9ubHkgcHJldmVudERlZmF1bHQgd2hpbGUgaW50ZXJhY3RpbmdcbiAgICAgICAgICAgICAgICBpZiAob3B0aW9uc1t0aGlzLnByZXBhcmVkLm5hbWVdICYmIG9wdGlvbnNbdGhpcy5wcmVwYXJlZC5uYW1lXS5tYW51YWxTdGFydFxuICAgICAgICAgICAgICAgICAgICAmJiAhdGhpcy5pbnRlcmFjdGluZygpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHByZXZlbnQgPT09ICdhbHdheXMnKSB7XG4gICAgICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgY2FsY0luZXJ0aWE6IGZ1bmN0aW9uIChzdGF0dXMpIHtcbiAgICAgICAgICAgIHZhciBpbmVydGlhT3B0aW9ucyA9IHRoaXMudGFyZ2V0Lm9wdGlvbnNbdGhpcy5wcmVwYXJlZC5uYW1lXS5pbmVydGlhLFxuICAgICAgICAgICAgICAgIGxhbWJkYSA9IGluZXJ0aWFPcHRpb25zLnJlc2lzdGFuY2UsXG4gICAgICAgICAgICAgICAgaW5lcnRpYUR1ciA9IC1NYXRoLmxvZyhpbmVydGlhT3B0aW9ucy5lbmRTcGVlZCAvIHN0YXR1cy52MCkgLyBsYW1iZGE7XG5cbiAgICAgICAgICAgIHN0YXR1cy54MCA9IHRoaXMucHJldkV2ZW50LnBhZ2VYO1xuICAgICAgICAgICAgc3RhdHVzLnkwID0gdGhpcy5wcmV2RXZlbnQucGFnZVk7XG4gICAgICAgICAgICBzdGF0dXMudDAgPSBzdGF0dXMuc3RhcnRFdmVudC50aW1lU3RhbXAgLyAxMDAwO1xuICAgICAgICAgICAgc3RhdHVzLnN4ID0gc3RhdHVzLnN5ID0gMDtcblxuICAgICAgICAgICAgc3RhdHVzLm1vZGlmaWVkWGUgPSBzdGF0dXMueGUgPSAoc3RhdHVzLnZ4MCAtIGluZXJ0aWFEdXIpIC8gbGFtYmRhO1xuICAgICAgICAgICAgc3RhdHVzLm1vZGlmaWVkWWUgPSBzdGF0dXMueWUgPSAoc3RhdHVzLnZ5MCAtIGluZXJ0aWFEdXIpIC8gbGFtYmRhO1xuICAgICAgICAgICAgc3RhdHVzLnRlID0gaW5lcnRpYUR1cjtcblxuICAgICAgICAgICAgc3RhdHVzLmxhbWJkYV92MCA9IGxhbWJkYSAvIHN0YXR1cy52MDtcbiAgICAgICAgICAgIHN0YXR1cy5vbmVfdmVfdjAgPSAxIC0gaW5lcnRpYU9wdGlvbnMuZW5kU3BlZWQgLyBzdGF0dXMudjA7XG4gICAgICAgIH0sXG5cbiAgICAgICAgYXV0b1Njcm9sbE1vdmU6IGZ1bmN0aW9uIChwb2ludGVyKSB7XG4gICAgICAgICAgICBpZiAoISh0aGlzLmludGVyYWN0aW5nKClcbiAgICAgICAgICAgICAgICAmJiBjaGVja0F1dG9TY3JvbGwodGhpcy50YXJnZXQsIHRoaXMucHJlcGFyZWQubmFtZSkpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodGhpcy5pbmVydGlhU3RhdHVzLmFjdGl2ZSkge1xuICAgICAgICAgICAgICAgIGF1dG9TY3JvbGwueCA9IGF1dG9TY3JvbGwueSA9IDA7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgdG9wLFxuICAgICAgICAgICAgICAgIHJpZ2h0LFxuICAgICAgICAgICAgICAgIGJvdHRvbSxcbiAgICAgICAgICAgICAgICBsZWZ0LFxuICAgICAgICAgICAgICAgIG9wdGlvbnMgPSB0aGlzLnRhcmdldC5vcHRpb25zW3RoaXMucHJlcGFyZWQubmFtZV0uYXV0b1Njcm9sbCxcbiAgICAgICAgICAgICAgICBjb250YWluZXIgPSBvcHRpb25zLmNvbnRhaW5lciB8fCBnZXRXaW5kb3codGhpcy5lbGVtZW50KTtcblxuICAgICAgICAgICAgaWYgKGlzV2luZG93KGNvbnRhaW5lcikpIHtcbiAgICAgICAgICAgICAgICBsZWZ0ICAgPSBwb2ludGVyLmNsaWVudFggPCBhdXRvU2Nyb2xsLm1hcmdpbjtcbiAgICAgICAgICAgICAgICB0b3AgICAgPSBwb2ludGVyLmNsaWVudFkgPCBhdXRvU2Nyb2xsLm1hcmdpbjtcbiAgICAgICAgICAgICAgICByaWdodCAgPSBwb2ludGVyLmNsaWVudFggPiBjb250YWluZXIuaW5uZXJXaWR0aCAgLSBhdXRvU2Nyb2xsLm1hcmdpbjtcbiAgICAgICAgICAgICAgICBib3R0b20gPSBwb2ludGVyLmNsaWVudFkgPiBjb250YWluZXIuaW5uZXJIZWlnaHQgLSBhdXRvU2Nyb2xsLm1hcmdpbjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciByZWN0ID0gZ2V0RWxlbWVudENsaWVudFJlY3QoY29udGFpbmVyKTtcblxuICAgICAgICAgICAgICAgIGxlZnQgICA9IHBvaW50ZXIuY2xpZW50WCA8IHJlY3QubGVmdCAgICsgYXV0b1Njcm9sbC5tYXJnaW47XG4gICAgICAgICAgICAgICAgdG9wICAgID0gcG9pbnRlci5jbGllbnRZIDwgcmVjdC50b3AgICAgKyBhdXRvU2Nyb2xsLm1hcmdpbjtcbiAgICAgICAgICAgICAgICByaWdodCAgPSBwb2ludGVyLmNsaWVudFggPiByZWN0LnJpZ2h0ICAtIGF1dG9TY3JvbGwubWFyZ2luO1xuICAgICAgICAgICAgICAgIGJvdHRvbSA9IHBvaW50ZXIuY2xpZW50WSA+IHJlY3QuYm90dG9tIC0gYXV0b1Njcm9sbC5tYXJnaW47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGF1dG9TY3JvbGwueCA9IChyaWdodCA/IDE6IGxlZnQ/IC0xOiAwKTtcbiAgICAgICAgICAgIGF1dG9TY3JvbGwueSA9IChib3R0b20/IDE6ICB0b3A/IC0xOiAwKTtcblxuICAgICAgICAgICAgaWYgKCFhdXRvU2Nyb2xsLmlzU2Nyb2xsaW5nKSB7XG4gICAgICAgICAgICAgICAgLy8gc2V0IHRoZSBhdXRvU2Nyb2xsIHByb3BlcnRpZXMgdG8gdGhvc2Ugb2YgdGhlIHRhcmdldFxuICAgICAgICAgICAgICAgIGF1dG9TY3JvbGwubWFyZ2luID0gb3B0aW9ucy5tYXJnaW47XG4gICAgICAgICAgICAgICAgYXV0b1Njcm9sbC5zcGVlZCAgPSBvcHRpb25zLnNwZWVkO1xuXG4gICAgICAgICAgICAgICAgYXV0b1Njcm9sbC5zdGFydCh0aGlzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBfdXBkYXRlRXZlbnRUYXJnZXRzOiBmdW5jdGlvbiAodGFyZ2V0LCBjdXJyZW50VGFyZ2V0KSB7XG4gICAgICAgICAgICB0aGlzLl9ldmVudFRhcmdldCAgICA9IHRhcmdldDtcbiAgICAgICAgICAgIHRoaXMuX2N1ckV2ZW50VGFyZ2V0ID0gY3VycmVudFRhcmdldDtcbiAgICAgICAgfVxuXG4gICAgfTtcblxuICAgIGZ1bmN0aW9uIGdldEludGVyYWN0aW9uRnJvbVBvaW50ZXIgKHBvaW50ZXIsIGV2ZW50VHlwZSwgZXZlbnRUYXJnZXQpIHtcbiAgICAgICAgdmFyIGkgPSAwLCBsZW4gPSBpbnRlcmFjdGlvbnMubGVuZ3RoLFxuICAgICAgICAgICAgbW91c2VFdmVudCA9ICgvbW91c2UvaS50ZXN0KHBvaW50ZXIucG9pbnRlclR5cGUgfHwgZXZlbnRUeXBlKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBNU1BvaW50ZXJFdmVudC5NU1BPSU5URVJfVFlQRV9NT1VTRVxuICAgICAgICAgICAgICAgICAgICAgICAgICB8fCBwb2ludGVyLnBvaW50ZXJUeXBlID09PSA0KSxcbiAgICAgICAgICAgIGludGVyYWN0aW9uO1xuXG4gICAgICAgIHZhciBpZCA9IGdldFBvaW50ZXJJZChwb2ludGVyKTtcblxuICAgICAgICAvLyB0cnkgdG8gcmVzdW1lIGluZXJ0aWEgd2l0aCBhIG5ldyBwb2ludGVyXG4gICAgICAgIGlmICgvZG93bnxzdGFydC9pLnRlc3QoZXZlbnRUeXBlKSkge1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaW50ZXJhY3Rpb24gPSBpbnRlcmFjdGlvbnNbaV07XG5cbiAgICAgICAgICAgICAgICB2YXIgZWxlbWVudCA9IGV2ZW50VGFyZ2V0O1xuXG4gICAgICAgICAgICAgICAgaWYgKGludGVyYWN0aW9uLmluZXJ0aWFTdGF0dXMuYWN0aXZlICYmIGludGVyYWN0aW9uLnRhcmdldC5vcHRpb25zW2ludGVyYWN0aW9uLnByZXBhcmVkLm5hbWVdLmluZXJ0aWEuYWxsb3dSZXN1bWVcbiAgICAgICAgICAgICAgICAgICAgJiYgKGludGVyYWN0aW9uLm1vdXNlID09PSBtb3VzZUV2ZW50KSkge1xuICAgICAgICAgICAgICAgICAgICB3aGlsZSAoZWxlbWVudCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWYgdGhlIGVsZW1lbnQgaXMgdGhlIGludGVyYWN0aW9uIGVsZW1lbnRcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChlbGVtZW50ID09PSBpbnRlcmFjdGlvbi5lbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGludGVyYWN0aW9uO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudCA9IHBhcmVudEVsZW1lbnQoZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBpZiBpdCdzIGEgbW91c2UgaW50ZXJhY3Rpb25cbiAgICAgICAgaWYgKG1vdXNlRXZlbnQgfHwgIShzdXBwb3J0c1RvdWNoIHx8IHN1cHBvcnRzUG9pbnRlckV2ZW50KSkge1xuXG4gICAgICAgICAgICAvLyBmaW5kIGEgbW91c2UgaW50ZXJhY3Rpb24gdGhhdCdzIG5vdCBpbiBpbmVydGlhIHBoYXNlXG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgICAgICBpZiAoaW50ZXJhY3Rpb25zW2ldLm1vdXNlICYmICFpbnRlcmFjdGlvbnNbaV0uaW5lcnRpYVN0YXR1cy5hY3RpdmUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGludGVyYWN0aW9uc1tpXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGZpbmQgYW55IGludGVyYWN0aW9uIHNwZWNpZmljYWxseSBmb3IgbW91c2UuXG4gICAgICAgICAgICAvLyBpZiB0aGUgZXZlbnRUeXBlIGlzIGEgbW91c2Vkb3duLCBhbmQgaW5lcnRpYSBpcyBhY3RpdmVcbiAgICAgICAgICAgIC8vIGlnbm9yZSB0aGUgaW50ZXJhY3Rpb25cbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgICAgICAgIGlmIChpbnRlcmFjdGlvbnNbaV0ubW91c2UgJiYgISgvZG93bi8udGVzdChldmVudFR5cGUpICYmIGludGVyYWN0aW9uc1tpXS5pbmVydGlhU3RhdHVzLmFjdGl2ZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGludGVyYWN0aW9uO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gY3JlYXRlIGEgbmV3IGludGVyYWN0aW9uIGZvciBtb3VzZVxuICAgICAgICAgICAgaW50ZXJhY3Rpb24gPSBuZXcgSW50ZXJhY3Rpb24oKTtcbiAgICAgICAgICAgIGludGVyYWN0aW9uLm1vdXNlID0gdHJ1ZTtcblxuICAgICAgICAgICAgcmV0dXJuIGludGVyYWN0aW9uO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gZ2V0IGludGVyYWN0aW9uIHRoYXQgaGFzIHRoaXMgcG9pbnRlclxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChjb250YWlucyhpbnRlcmFjdGlvbnNbaV0ucG9pbnRlcklkcywgaWQpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGludGVyYWN0aW9uc1tpXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGF0IHRoaXMgc3RhZ2UsIGEgcG9pbnRlclVwIHNob3VsZCBub3QgcmV0dXJuIGFuIGludGVyYWN0aW9uXG4gICAgICAgIGlmICgvdXB8ZW5kfG91dC9pLnRlc3QoZXZlbnRUeXBlKSkge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBnZXQgZmlyc3QgaWRsZSBpbnRlcmFjdGlvblxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgIGludGVyYWN0aW9uID0gaW50ZXJhY3Rpb25zW2ldO1xuXG4gICAgICAgICAgICBpZiAoKCFpbnRlcmFjdGlvbi5wcmVwYXJlZC5uYW1lIHx8IChpbnRlcmFjdGlvbi50YXJnZXQub3B0aW9ucy5nZXN0dXJlLmVuYWJsZWQpKVxuICAgICAgICAgICAgICAgICYmICFpbnRlcmFjdGlvbi5pbnRlcmFjdGluZygpXG4gICAgICAgICAgICAgICAgJiYgISghbW91c2VFdmVudCAmJiBpbnRlcmFjdGlvbi5tb3VzZSkpIHtcblxuICAgICAgICAgICAgICAgIHJldHVybiBpbnRlcmFjdGlvbjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBuZXcgSW50ZXJhY3Rpb24oKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBkb09uSW50ZXJhY3Rpb25zIChtZXRob2QpIHtcbiAgICAgICAgcmV0dXJuIChmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgIHZhciBpbnRlcmFjdGlvbixcbiAgICAgICAgICAgICAgICBldmVudFRhcmdldCA9IGdldEFjdHVhbEVsZW1lbnQoZXZlbnQucGF0aFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA/IGV2ZW50LnBhdGhbMF1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgOiBldmVudC50YXJnZXQpLFxuICAgICAgICAgICAgICAgIGN1ckV2ZW50VGFyZ2V0ID0gZ2V0QWN0dWFsRWxlbWVudChldmVudC5jdXJyZW50VGFyZ2V0KSxcbiAgICAgICAgICAgICAgICBpO1xuXG4gICAgICAgICAgICBpZiAoc3VwcG9ydHNUb3VjaCAmJiAvdG91Y2gvLnRlc3QoZXZlbnQudHlwZSkpIHtcbiAgICAgICAgICAgICAgICBwcmV2VG91Y2hUaW1lID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG5cbiAgICAgICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgZXZlbnQuY2hhbmdlZFRvdWNoZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHBvaW50ZXIgPSBldmVudC5jaGFuZ2VkVG91Y2hlc1tpXTtcblxuICAgICAgICAgICAgICAgICAgICBpbnRlcmFjdGlvbiA9IGdldEludGVyYWN0aW9uRnJvbVBvaW50ZXIocG9pbnRlciwgZXZlbnQudHlwZSwgZXZlbnRUYXJnZXQpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmICghaW50ZXJhY3Rpb24pIHsgY29udGludWU7IH1cblxuICAgICAgICAgICAgICAgICAgICBpbnRlcmFjdGlvbi5fdXBkYXRlRXZlbnRUYXJnZXRzKGV2ZW50VGFyZ2V0LCBjdXJFdmVudFRhcmdldCk7XG5cbiAgICAgICAgICAgICAgICAgICAgaW50ZXJhY3Rpb25bbWV0aG9kXShwb2ludGVyLCBldmVudCwgZXZlbnRUYXJnZXQsIGN1ckV2ZW50VGFyZ2V0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAoIXN1cHBvcnRzUG9pbnRlckV2ZW50ICYmIC9tb3VzZS8udGVzdChldmVudC50eXBlKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBpZ25vcmUgbW91c2UgZXZlbnRzIHdoaWxlIHRvdWNoIGludGVyYWN0aW9ucyBhcmUgYWN0aXZlXG4gICAgICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBpbnRlcmFjdGlvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghaW50ZXJhY3Rpb25zW2ldLm1vdXNlICYmIGludGVyYWN0aW9uc1tpXS5wb2ludGVySXNEb3duKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gdHJ5IHRvIGlnbm9yZSBtb3VzZSBldmVudHMgdGhhdCBhcmUgc2ltdWxhdGVkIGJ5IHRoZSBicm93c2VyXG4gICAgICAgICAgICAgICAgICAgIC8vIGFmdGVyIGEgdG91Y2ggZXZlbnRcbiAgICAgICAgICAgICAgICAgICAgaWYgKG5ldyBEYXRlKCkuZ2V0VGltZSgpIC0gcHJldlRvdWNoVGltZSA8IDUwMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaW50ZXJhY3Rpb24gPSBnZXRJbnRlcmFjdGlvbkZyb21Qb2ludGVyKGV2ZW50LCBldmVudC50eXBlLCBldmVudFRhcmdldCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoIWludGVyYWN0aW9uKSB7IHJldHVybjsgfVxuXG4gICAgICAgICAgICAgICAgaW50ZXJhY3Rpb24uX3VwZGF0ZUV2ZW50VGFyZ2V0cyhldmVudFRhcmdldCwgY3VyRXZlbnRUYXJnZXQpO1xuXG4gICAgICAgICAgICAgICAgaW50ZXJhY3Rpb25bbWV0aG9kXShldmVudCwgZXZlbnQsIGV2ZW50VGFyZ2V0LCBjdXJFdmVudFRhcmdldCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIEludGVyYWN0RXZlbnQgKGludGVyYWN0aW9uLCBldmVudCwgYWN0aW9uLCBwaGFzZSwgZWxlbWVudCwgcmVsYXRlZCkge1xuICAgICAgICB2YXIgY2xpZW50LFxuICAgICAgICAgICAgcGFnZSxcbiAgICAgICAgICAgIHRhcmdldCAgICAgID0gaW50ZXJhY3Rpb24udGFyZ2V0LFxuICAgICAgICAgICAgc25hcFN0YXR1cyAgPSBpbnRlcmFjdGlvbi5zbmFwU3RhdHVzLFxuICAgICAgICAgICAgcmVzdHJpY3RTdGF0dXMgID0gaW50ZXJhY3Rpb24ucmVzdHJpY3RTdGF0dXMsXG4gICAgICAgICAgICBwb2ludGVycyAgICA9IGludGVyYWN0aW9uLnBvaW50ZXJzLFxuICAgICAgICAgICAgZGVsdGFTb3VyY2UgPSAodGFyZ2V0ICYmIHRhcmdldC5vcHRpb25zIHx8IGRlZmF1bHRPcHRpb25zKS5kZWx0YVNvdXJjZSxcbiAgICAgICAgICAgIHNvdXJjZVggICAgID0gZGVsdGFTb3VyY2UgKyAnWCcsXG4gICAgICAgICAgICBzb3VyY2VZICAgICA9IGRlbHRhU291cmNlICsgJ1knLFxuICAgICAgICAgICAgb3B0aW9ucyAgICAgPSB0YXJnZXQ/IHRhcmdldC5vcHRpb25zOiBkZWZhdWx0T3B0aW9ucyxcbiAgICAgICAgICAgIG9yaWdpbiAgICAgID0gZ2V0T3JpZ2luWFkodGFyZ2V0LCBlbGVtZW50KSxcbiAgICAgICAgICAgIHN0YXJ0aW5nICAgID0gcGhhc2UgPT09ICdzdGFydCcsXG4gICAgICAgICAgICBlbmRpbmcgICAgICA9IHBoYXNlID09PSAnZW5kJyxcbiAgICAgICAgICAgIGNvb3JkcyAgICAgID0gc3RhcnRpbmc/IGludGVyYWN0aW9uLnN0YXJ0Q29vcmRzIDogaW50ZXJhY3Rpb24uY3VyQ29vcmRzO1xuXG4gICAgICAgIGVsZW1lbnQgPSBlbGVtZW50IHx8IGludGVyYWN0aW9uLmVsZW1lbnQ7XG5cbiAgICAgICAgcGFnZSAgID0gZXh0ZW5kKHt9LCBjb29yZHMucGFnZSk7XG4gICAgICAgIGNsaWVudCA9IGV4dGVuZCh7fSwgY29vcmRzLmNsaWVudCk7XG5cbiAgICAgICAgcGFnZS54IC09IG9yaWdpbi54O1xuICAgICAgICBwYWdlLnkgLT0gb3JpZ2luLnk7XG5cbiAgICAgICAgY2xpZW50LnggLT0gb3JpZ2luLng7XG4gICAgICAgIGNsaWVudC55IC09IG9yaWdpbi55O1xuXG4gICAgICAgIHZhciByZWxhdGl2ZVBvaW50cyA9IG9wdGlvbnNbYWN0aW9uXS5zbmFwICYmIG9wdGlvbnNbYWN0aW9uXS5zbmFwLnJlbGF0aXZlUG9pbnRzIDtcblxuICAgICAgICBpZiAoY2hlY2tTbmFwKHRhcmdldCwgYWN0aW9uKSAmJiAhKHN0YXJ0aW5nICYmIHJlbGF0aXZlUG9pbnRzICYmIHJlbGF0aXZlUG9pbnRzLmxlbmd0aCkpIHtcbiAgICAgICAgICAgIHRoaXMuc25hcCA9IHtcbiAgICAgICAgICAgICAgICByYW5nZSAgOiBzbmFwU3RhdHVzLnJhbmdlLFxuICAgICAgICAgICAgICAgIGxvY2tlZCA6IHNuYXBTdGF0dXMubG9ja2VkLFxuICAgICAgICAgICAgICAgIHggICAgICA6IHNuYXBTdGF0dXMuc25hcHBlZFgsXG4gICAgICAgICAgICAgICAgeSAgICAgIDogc25hcFN0YXR1cy5zbmFwcGVkWSxcbiAgICAgICAgICAgICAgICByZWFsWCAgOiBzbmFwU3RhdHVzLnJlYWxYLFxuICAgICAgICAgICAgICAgIHJlYWxZICA6IHNuYXBTdGF0dXMucmVhbFksXG4gICAgICAgICAgICAgICAgZHggICAgIDogc25hcFN0YXR1cy5keCxcbiAgICAgICAgICAgICAgICBkeSAgICAgOiBzbmFwU3RhdHVzLmR5XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBpZiAoc25hcFN0YXR1cy5sb2NrZWQpIHtcbiAgICAgICAgICAgICAgICBwYWdlLnggKz0gc25hcFN0YXR1cy5keDtcbiAgICAgICAgICAgICAgICBwYWdlLnkgKz0gc25hcFN0YXR1cy5keTtcbiAgICAgICAgICAgICAgICBjbGllbnQueCArPSBzbmFwU3RhdHVzLmR4O1xuICAgICAgICAgICAgICAgIGNsaWVudC55ICs9IHNuYXBTdGF0dXMuZHk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY2hlY2tSZXN0cmljdCh0YXJnZXQsIGFjdGlvbikgJiYgIShzdGFydGluZyAmJiBvcHRpb25zW2FjdGlvbl0ucmVzdHJpY3QuZWxlbWVudFJlY3QpICYmIHJlc3RyaWN0U3RhdHVzLnJlc3RyaWN0ZWQpIHtcbiAgICAgICAgICAgIHBhZ2UueCArPSByZXN0cmljdFN0YXR1cy5keDtcbiAgICAgICAgICAgIHBhZ2UueSArPSByZXN0cmljdFN0YXR1cy5keTtcbiAgICAgICAgICAgIGNsaWVudC54ICs9IHJlc3RyaWN0U3RhdHVzLmR4O1xuICAgICAgICAgICAgY2xpZW50LnkgKz0gcmVzdHJpY3RTdGF0dXMuZHk7XG5cbiAgICAgICAgICAgIHRoaXMucmVzdHJpY3QgPSB7XG4gICAgICAgICAgICAgICAgZHg6IHJlc3RyaWN0U3RhdHVzLmR4LFxuICAgICAgICAgICAgICAgIGR5OiByZXN0cmljdFN0YXR1cy5keVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMucGFnZVggICAgID0gcGFnZS54O1xuICAgICAgICB0aGlzLnBhZ2VZICAgICA9IHBhZ2UueTtcbiAgICAgICAgdGhpcy5jbGllbnRYICAgPSBjbGllbnQueDtcbiAgICAgICAgdGhpcy5jbGllbnRZICAgPSBjbGllbnQueTtcblxuICAgICAgICB0aGlzLngwICAgICAgICA9IGludGVyYWN0aW9uLnN0YXJ0Q29vcmRzLnBhZ2UueCAtIG9yaWdpbi54O1xuICAgICAgICB0aGlzLnkwICAgICAgICA9IGludGVyYWN0aW9uLnN0YXJ0Q29vcmRzLnBhZ2UueSAtIG9yaWdpbi55O1xuICAgICAgICB0aGlzLmNsaWVudFgwICA9IGludGVyYWN0aW9uLnN0YXJ0Q29vcmRzLmNsaWVudC54IC0gb3JpZ2luLng7XG4gICAgICAgIHRoaXMuY2xpZW50WTAgID0gaW50ZXJhY3Rpb24uc3RhcnRDb29yZHMuY2xpZW50LnkgLSBvcmlnaW4ueTtcbiAgICAgICAgdGhpcy5jdHJsS2V5ICAgPSBldmVudC5jdHJsS2V5O1xuICAgICAgICB0aGlzLmFsdEtleSAgICA9IGV2ZW50LmFsdEtleTtcbiAgICAgICAgdGhpcy5zaGlmdEtleSAgPSBldmVudC5zaGlmdEtleTtcbiAgICAgICAgdGhpcy5tZXRhS2V5ICAgPSBldmVudC5tZXRhS2V5O1xuICAgICAgICB0aGlzLmJ1dHRvbiAgICA9IGV2ZW50LmJ1dHRvbjtcbiAgICAgICAgdGhpcy5idXR0b25zICAgPSBldmVudC5idXR0b25zO1xuICAgICAgICB0aGlzLnRhcmdldCAgICA9IGVsZW1lbnQ7XG4gICAgICAgIHRoaXMudDAgICAgICAgID0gaW50ZXJhY3Rpb24uZG93blRpbWVzWzBdO1xuICAgICAgICB0aGlzLnR5cGUgICAgICA9IGFjdGlvbiArIChwaGFzZSB8fCAnJyk7XG5cbiAgICAgICAgdGhpcy5pbnRlcmFjdGlvbiA9IGludGVyYWN0aW9uO1xuICAgICAgICB0aGlzLmludGVyYWN0YWJsZSA9IHRhcmdldDtcblxuICAgICAgICB2YXIgaW5lcnRpYVN0YXR1cyA9IGludGVyYWN0aW9uLmluZXJ0aWFTdGF0dXM7XG5cbiAgICAgICAgaWYgKGluZXJ0aWFTdGF0dXMuYWN0aXZlKSB7XG4gICAgICAgICAgICB0aGlzLmRldGFpbCA9ICdpbmVydGlhJztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChyZWxhdGVkKSB7XG4gICAgICAgICAgICB0aGlzLnJlbGF0ZWRUYXJnZXQgPSByZWxhdGVkO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gZW5kIGV2ZW50IGR4LCBkeSBpcyBkaWZmZXJlbmNlIGJldHdlZW4gc3RhcnQgYW5kIGVuZCBwb2ludHNcbiAgICAgICAgaWYgKGVuZGluZykge1xuICAgICAgICAgICAgaWYgKGRlbHRhU291cmNlID09PSAnY2xpZW50Jykge1xuICAgICAgICAgICAgICAgIHRoaXMuZHggPSBjbGllbnQueCAtIGludGVyYWN0aW9uLnN0YXJ0Q29vcmRzLmNsaWVudC54O1xuICAgICAgICAgICAgICAgIHRoaXMuZHkgPSBjbGllbnQueSAtIGludGVyYWN0aW9uLnN0YXJ0Q29vcmRzLmNsaWVudC55O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5keCA9IHBhZ2UueCAtIGludGVyYWN0aW9uLnN0YXJ0Q29vcmRzLnBhZ2UueDtcbiAgICAgICAgICAgICAgICB0aGlzLmR5ID0gcGFnZS55IC0gaW50ZXJhY3Rpb24uc3RhcnRDb29yZHMucGFnZS55O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHN0YXJ0aW5nKSB7XG4gICAgICAgICAgICB0aGlzLmR4ID0gMDtcbiAgICAgICAgICAgIHRoaXMuZHkgPSAwO1xuICAgICAgICB9XG4gICAgICAgIC8vIGNvcHkgcHJvcGVydGllcyBmcm9tIHByZXZpb3VzbW92ZSBpZiBzdGFydGluZyBpbmVydGlhXG4gICAgICAgIGVsc2UgaWYgKHBoYXNlID09PSAnaW5lcnRpYXN0YXJ0Jykge1xuICAgICAgICAgICAgdGhpcy5keCA9IGludGVyYWN0aW9uLnByZXZFdmVudC5keDtcbiAgICAgICAgICAgIHRoaXMuZHkgPSBpbnRlcmFjdGlvbi5wcmV2RXZlbnQuZHk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBpZiAoZGVsdGFTb3VyY2UgPT09ICdjbGllbnQnKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5keCA9IGNsaWVudC54IC0gaW50ZXJhY3Rpb24ucHJldkV2ZW50LmNsaWVudFg7XG4gICAgICAgICAgICAgICAgdGhpcy5keSA9IGNsaWVudC55IC0gaW50ZXJhY3Rpb24ucHJldkV2ZW50LmNsaWVudFk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLmR4ID0gcGFnZS54IC0gaW50ZXJhY3Rpb24ucHJldkV2ZW50LnBhZ2VYO1xuICAgICAgICAgICAgICAgIHRoaXMuZHkgPSBwYWdlLnkgLSBpbnRlcmFjdGlvbi5wcmV2RXZlbnQucGFnZVk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGludGVyYWN0aW9uLnByZXZFdmVudCAmJiBpbnRlcmFjdGlvbi5wcmV2RXZlbnQuZGV0YWlsID09PSAnaW5lcnRpYSdcbiAgICAgICAgICAgICYmICFpbmVydGlhU3RhdHVzLmFjdGl2ZVxuICAgICAgICAgICAgJiYgb3B0aW9uc1thY3Rpb25dLmluZXJ0aWEgJiYgb3B0aW9uc1thY3Rpb25dLmluZXJ0aWEuemVyb1Jlc3VtZURlbHRhKSB7XG5cbiAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMucmVzdW1lRHggKz0gdGhpcy5keDtcbiAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMucmVzdW1lRHkgKz0gdGhpcy5keTtcblxuICAgICAgICAgICAgdGhpcy5keCA9IHRoaXMuZHkgPSAwO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGFjdGlvbiA9PT0gJ3Jlc2l6ZScgJiYgaW50ZXJhY3Rpb24ucmVzaXplQXhlcykge1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMucmVzaXplLnNxdWFyZSkge1xuICAgICAgICAgICAgICAgIGlmIChpbnRlcmFjdGlvbi5yZXNpemVBeGVzID09PSAneScpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5keCA9IHRoaXMuZHk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmR5ID0gdGhpcy5keDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhpcy5heGVzID0gJ3h5JztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuYXhlcyA9IGludGVyYWN0aW9uLnJlc2l6ZUF4ZXM7XG5cbiAgICAgICAgICAgICAgICBpZiAoaW50ZXJhY3Rpb24ucmVzaXplQXhlcyA9PT0gJ3gnKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZHkgPSAwO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChpbnRlcmFjdGlvbi5yZXNpemVBeGVzID09PSAneScpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5keCA9IDA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGFjdGlvbiA9PT0gJ2dlc3R1cmUnKSB7XG4gICAgICAgICAgICB0aGlzLnRvdWNoZXMgPSBbcG9pbnRlcnNbMF0sIHBvaW50ZXJzWzFdXTtcblxuICAgICAgICAgICAgaWYgKHN0YXJ0aW5nKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kaXN0YW5jZSA9IHRvdWNoRGlzdGFuY2UocG9pbnRlcnMsIGRlbHRhU291cmNlKTtcbiAgICAgICAgICAgICAgICB0aGlzLmJveCAgICAgID0gdG91Y2hCQm94KHBvaW50ZXJzKTtcbiAgICAgICAgICAgICAgICB0aGlzLnNjYWxlICAgID0gMTtcbiAgICAgICAgICAgICAgICB0aGlzLmRzICAgICAgID0gMDtcbiAgICAgICAgICAgICAgICB0aGlzLmFuZ2xlICAgID0gdG91Y2hBbmdsZShwb2ludGVycywgdW5kZWZpbmVkLCBkZWx0YVNvdXJjZSk7XG4gICAgICAgICAgICAgICAgdGhpcy5kYSAgICAgICA9IDA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChlbmRpbmcgfHwgZXZlbnQgaW5zdGFuY2VvZiBJbnRlcmFjdEV2ZW50KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kaXN0YW5jZSA9IGludGVyYWN0aW9uLnByZXZFdmVudC5kaXN0YW5jZTtcbiAgICAgICAgICAgICAgICB0aGlzLmJveCAgICAgID0gaW50ZXJhY3Rpb24ucHJldkV2ZW50LmJveDtcbiAgICAgICAgICAgICAgICB0aGlzLnNjYWxlICAgID0gaW50ZXJhY3Rpb24ucHJldkV2ZW50LnNjYWxlO1xuICAgICAgICAgICAgICAgIHRoaXMuZHMgICAgICAgPSB0aGlzLnNjYWxlIC0gMTtcbiAgICAgICAgICAgICAgICB0aGlzLmFuZ2xlICAgID0gaW50ZXJhY3Rpb24ucHJldkV2ZW50LmFuZ2xlO1xuICAgICAgICAgICAgICAgIHRoaXMuZGEgICAgICAgPSB0aGlzLmFuZ2xlIC0gaW50ZXJhY3Rpb24uZ2VzdHVyZS5zdGFydEFuZ2xlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kaXN0YW5jZSA9IHRvdWNoRGlzdGFuY2UocG9pbnRlcnMsIGRlbHRhU291cmNlKTtcbiAgICAgICAgICAgICAgICB0aGlzLmJveCAgICAgID0gdG91Y2hCQm94KHBvaW50ZXJzKTtcbiAgICAgICAgICAgICAgICB0aGlzLnNjYWxlICAgID0gdGhpcy5kaXN0YW5jZSAvIGludGVyYWN0aW9uLmdlc3R1cmUuc3RhcnREaXN0YW5jZTtcbiAgICAgICAgICAgICAgICB0aGlzLmFuZ2xlICAgID0gdG91Y2hBbmdsZShwb2ludGVycywgaW50ZXJhY3Rpb24uZ2VzdHVyZS5wcmV2QW5nbGUsIGRlbHRhU291cmNlKTtcblxuICAgICAgICAgICAgICAgIHRoaXMuZHMgPSB0aGlzLnNjYWxlIC0gaW50ZXJhY3Rpb24uZ2VzdHVyZS5wcmV2U2NhbGU7XG4gICAgICAgICAgICAgICAgdGhpcy5kYSA9IHRoaXMuYW5nbGUgLSBpbnRlcmFjdGlvbi5nZXN0dXJlLnByZXZBbmdsZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdGFydGluZykge1xuICAgICAgICAgICAgdGhpcy50aW1lU3RhbXAgPSBpbnRlcmFjdGlvbi5kb3duVGltZXNbMF07XG4gICAgICAgICAgICB0aGlzLmR0ICAgICAgICA9IDA7XG4gICAgICAgICAgICB0aGlzLmR1cmF0aW9uICA9IDA7XG4gICAgICAgICAgICB0aGlzLnNwZWVkICAgICA9IDA7XG4gICAgICAgICAgICB0aGlzLnZlbG9jaXR5WCA9IDA7XG4gICAgICAgICAgICB0aGlzLnZlbG9jaXR5WSA9IDA7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAocGhhc2UgPT09ICdpbmVydGlhc3RhcnQnKSB7XG4gICAgICAgICAgICB0aGlzLnRpbWVTdGFtcCA9IGludGVyYWN0aW9uLnByZXZFdmVudC50aW1lU3RhbXA7XG4gICAgICAgICAgICB0aGlzLmR0ICAgICAgICA9IGludGVyYWN0aW9uLnByZXZFdmVudC5kdDtcbiAgICAgICAgICAgIHRoaXMuZHVyYXRpb24gID0gaW50ZXJhY3Rpb24ucHJldkV2ZW50LmR1cmF0aW9uO1xuICAgICAgICAgICAgdGhpcy5zcGVlZCAgICAgPSBpbnRlcmFjdGlvbi5wcmV2RXZlbnQuc3BlZWQ7XG4gICAgICAgICAgICB0aGlzLnZlbG9jaXR5WCA9IGludGVyYWN0aW9uLnByZXZFdmVudC52ZWxvY2l0eVg7XG4gICAgICAgICAgICB0aGlzLnZlbG9jaXR5WSA9IGludGVyYWN0aW9uLnByZXZFdmVudC52ZWxvY2l0eVk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnRpbWVTdGFtcCA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgICAgICAgICAgdGhpcy5kdCAgICAgICAgPSB0aGlzLnRpbWVTdGFtcCAtIGludGVyYWN0aW9uLnByZXZFdmVudC50aW1lU3RhbXA7XG4gICAgICAgICAgICB0aGlzLmR1cmF0aW9uICA9IHRoaXMudGltZVN0YW1wIC0gaW50ZXJhY3Rpb24uZG93blRpbWVzWzBdO1xuXG4gICAgICAgICAgICBpZiAoZXZlbnQgaW5zdGFuY2VvZiBJbnRlcmFjdEV2ZW50KSB7XG4gICAgICAgICAgICAgICAgdmFyIGR4ID0gdGhpc1tzb3VyY2VYXSAtIGludGVyYWN0aW9uLnByZXZFdmVudFtzb3VyY2VYXSxcbiAgICAgICAgICAgICAgICAgICAgZHkgPSB0aGlzW3NvdXJjZVldIC0gaW50ZXJhY3Rpb24ucHJldkV2ZW50W3NvdXJjZVldLFxuICAgICAgICAgICAgICAgICAgICBkdCA9IHRoaXMuZHQgLyAxMDAwO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5zcGVlZCA9IGh5cG90KGR4LCBkeSkgLyBkdDtcbiAgICAgICAgICAgICAgICB0aGlzLnZlbG9jaXR5WCA9IGR4IC8gZHQ7XG4gICAgICAgICAgICAgICAgdGhpcy52ZWxvY2l0eVkgPSBkeSAvIGR0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gaWYgbm9ybWFsIG1vdmUgb3IgZW5kIGV2ZW50LCB1c2UgcHJldmlvdXMgdXNlciBldmVudCBjb29yZHNcbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIHNwZWVkIGFuZCB2ZWxvY2l0eSBpbiBwaXhlbHMgcGVyIHNlY29uZFxuICAgICAgICAgICAgICAgIHRoaXMuc3BlZWQgPSBpbnRlcmFjdGlvbi5wb2ludGVyRGVsdGFbZGVsdGFTb3VyY2VdLnNwZWVkO1xuICAgICAgICAgICAgICAgIHRoaXMudmVsb2NpdHlYID0gaW50ZXJhY3Rpb24ucG9pbnRlckRlbHRhW2RlbHRhU291cmNlXS52eDtcbiAgICAgICAgICAgICAgICB0aGlzLnZlbG9jaXR5WSA9IGludGVyYWN0aW9uLnBvaW50ZXJEZWx0YVtkZWx0YVNvdXJjZV0udnk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoKGVuZGluZyB8fCBwaGFzZSA9PT0gJ2luZXJ0aWFzdGFydCcpXG4gICAgICAgICAgICAmJiBpbnRlcmFjdGlvbi5wcmV2RXZlbnQuc3BlZWQgPiA2MDAgJiYgdGhpcy50aW1lU3RhbXAgLSBpbnRlcmFjdGlvbi5wcmV2RXZlbnQudGltZVN0YW1wIDwgMTUwKSB7XG5cbiAgICAgICAgICAgIHZhciBhbmdsZSA9IDE4MCAqIE1hdGguYXRhbjIoaW50ZXJhY3Rpb24ucHJldkV2ZW50LnZlbG9jaXR5WSwgaW50ZXJhY3Rpb24ucHJldkV2ZW50LnZlbG9jaXR5WCkgLyBNYXRoLlBJLFxuICAgICAgICAgICAgICAgIG92ZXJsYXAgPSAyMi41O1xuXG4gICAgICAgICAgICBpZiAoYW5nbGUgPCAwKSB7XG4gICAgICAgICAgICAgICAgYW5nbGUgKz0gMzYwO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgbGVmdCA9IDEzNSAtIG92ZXJsYXAgPD0gYW5nbGUgJiYgYW5nbGUgPCAyMjUgKyBvdmVybGFwLFxuICAgICAgICAgICAgICAgIHVwICAgPSAyMjUgLSBvdmVybGFwIDw9IGFuZ2xlICYmIGFuZ2xlIDwgMzE1ICsgb3ZlcmxhcCxcblxuICAgICAgICAgICAgICAgIHJpZ2h0ID0gIWxlZnQgJiYgKDMxNSAtIG92ZXJsYXAgPD0gYW5nbGUgfHwgYW5nbGUgPCAgNDUgKyBvdmVybGFwKSxcbiAgICAgICAgICAgICAgICBkb3duICA9ICF1cCAgICYmICAgNDUgLSBvdmVybGFwIDw9IGFuZ2xlICYmIGFuZ2xlIDwgMTM1ICsgb3ZlcmxhcDtcblxuICAgICAgICAgICAgdGhpcy5zd2lwZSA9IHtcbiAgICAgICAgICAgICAgICB1cCAgIDogdXAsXG4gICAgICAgICAgICAgICAgZG93biA6IGRvd24sXG4gICAgICAgICAgICAgICAgbGVmdCA6IGxlZnQsXG4gICAgICAgICAgICAgICAgcmlnaHQ6IHJpZ2h0LFxuICAgICAgICAgICAgICAgIGFuZ2xlOiBhbmdsZSxcbiAgICAgICAgICAgICAgICBzcGVlZDogaW50ZXJhY3Rpb24ucHJldkV2ZW50LnNwZWVkLFxuICAgICAgICAgICAgICAgIHZlbG9jaXR5OiB7XG4gICAgICAgICAgICAgICAgICAgIHg6IGludGVyYWN0aW9uLnByZXZFdmVudC52ZWxvY2l0eVgsXG4gICAgICAgICAgICAgICAgICAgIHk6IGludGVyYWN0aW9uLnByZXZFdmVudC52ZWxvY2l0eVlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgSW50ZXJhY3RFdmVudC5wcm90b3R5cGUgPSB7XG4gICAgICAgIHByZXZlbnREZWZhdWx0OiBibGFuayxcbiAgICAgICAgc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLmltbWVkaWF0ZVByb3BhZ2F0aW9uU3RvcHBlZCA9IHRoaXMucHJvcGFnYXRpb25TdG9wcGVkID0gdHJ1ZTtcbiAgICAgICAgfSxcbiAgICAgICAgc3RvcFByb3BhZ2F0aW9uOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLnByb3BhZ2F0aW9uU3RvcHBlZCA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgZnVuY3Rpb24gcHJldmVudE9yaWdpbmFsRGVmYXVsdCAoKSB7XG4gICAgICAgIHRoaXMub3JpZ2luYWxFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldEFjdGlvbkN1cnNvciAoYWN0aW9uKSB7XG4gICAgICAgIHZhciBjdXJzb3IgPSAnJztcblxuICAgICAgICBpZiAoYWN0aW9uLm5hbWUgPT09ICdkcmFnJykge1xuICAgICAgICAgICAgY3Vyc29yID0gIGFjdGlvbkN1cnNvcnMuZHJhZztcbiAgICAgICAgfVxuICAgICAgICBpZiAoYWN0aW9uLm5hbWUgPT09ICdyZXNpemUnKSB7XG4gICAgICAgICAgICBpZiAoYWN0aW9uLmF4aXMpIHtcbiAgICAgICAgICAgICAgICBjdXJzb3IgPSAgYWN0aW9uQ3Vyc29yc1thY3Rpb24ubmFtZSArIGFjdGlvbi5heGlzXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGFjdGlvbi5lZGdlcykge1xuICAgICAgICAgICAgICAgIHZhciBjdXJzb3JLZXkgPSAncmVzaXplJyxcbiAgICAgICAgICAgICAgICAgICAgZWRnZU5hbWVzID0gWyd0b3AnLCAnYm90dG9tJywgJ2xlZnQnLCAncmlnaHQnXTtcblxuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgNDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhY3Rpb24uZWRnZXNbZWRnZU5hbWVzW2ldXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY3Vyc29yS2V5ICs9IGVkZ2VOYW1lc1tpXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGN1cnNvciA9IGFjdGlvbkN1cnNvcnNbY3Vyc29yS2V5XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBjdXJzb3I7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY2hlY2tSZXNpemVFZGdlIChuYW1lLCB2YWx1ZSwgcGFnZSwgZWxlbWVudCwgaW50ZXJhY3RhYmxlRWxlbWVudCwgcmVjdCwgbWFyZ2luKSB7XG4gICAgICAgIC8vIGZhbHNlLCAnJywgdW5kZWZpbmVkLCBudWxsXG4gICAgICAgIGlmICghdmFsdWUpIHsgcmV0dXJuIGZhbHNlOyB9XG5cbiAgICAgICAgLy8gdHJ1ZSB2YWx1ZSwgdXNlIHBvaW50ZXIgY29vcmRzIGFuZCBlbGVtZW50IHJlY3RcbiAgICAgICAgaWYgKHZhbHVlID09PSB0cnVlKSB7XG4gICAgICAgICAgICAvLyBpZiBkaW1lbnNpb25zIGFyZSBuZWdhdGl2ZSwgXCJzd2l0Y2hcIiBlZGdlc1xuICAgICAgICAgICAgdmFyIHdpZHRoID0gaXNOdW1iZXIocmVjdC53aWR0aCk/IHJlY3Qud2lkdGggOiByZWN0LnJpZ2h0IC0gcmVjdC5sZWZ0LFxuICAgICAgICAgICAgICAgIGhlaWdodCA9IGlzTnVtYmVyKHJlY3QuaGVpZ2h0KT8gcmVjdC5oZWlnaHQgOiByZWN0LmJvdHRvbSAtIHJlY3QudG9wO1xuXG4gICAgICAgICAgICBpZiAod2lkdGggPCAwKSB7XG4gICAgICAgICAgICAgICAgaWYgICAgICAobmFtZSA9PT0gJ2xlZnQnICkgeyBuYW1lID0gJ3JpZ2h0JzsgfVxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKG5hbWUgPT09ICdyaWdodCcpIHsgbmFtZSA9ICdsZWZ0JyA7IH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChoZWlnaHQgPCAwKSB7XG4gICAgICAgICAgICAgICAgaWYgICAgICAobmFtZSA9PT0gJ3RvcCcgICApIHsgbmFtZSA9ICdib3R0b20nOyB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAobmFtZSA9PT0gJ2JvdHRvbScpIHsgbmFtZSA9ICd0b3AnICAgOyB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChuYW1lID09PSAnbGVmdCcgICkgeyByZXR1cm4gcGFnZS54IDwgKCh3aWR0aCAgPj0gMD8gcmVjdC5sZWZ0OiByZWN0LnJpZ2h0ICkgKyBtYXJnaW4pOyB9XG4gICAgICAgICAgICBpZiAobmFtZSA9PT0gJ3RvcCcgICApIHsgcmV0dXJuIHBhZ2UueSA8ICgoaGVpZ2h0ID49IDA/IHJlY3QudG9wIDogcmVjdC5ib3R0b20pICsgbWFyZ2luKTsgfVxuXG4gICAgICAgICAgICBpZiAobmFtZSA9PT0gJ3JpZ2h0JyApIHsgcmV0dXJuIHBhZ2UueCA+ICgod2lkdGggID49IDA/IHJlY3QucmlnaHQgOiByZWN0LmxlZnQpIC0gbWFyZ2luKTsgfVxuICAgICAgICAgICAgaWYgKG5hbWUgPT09ICdib3R0b20nKSB7IHJldHVybiBwYWdlLnkgPiAoKGhlaWdodCA+PSAwPyByZWN0LmJvdHRvbTogcmVjdC50b3AgKSAtIG1hcmdpbik7IH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHRoZSByZW1haW5pbmcgY2hlY2tzIHJlcXVpcmUgYW4gZWxlbWVudFxuICAgICAgICBpZiAoIWlzRWxlbWVudChlbGVtZW50KSkgeyByZXR1cm4gZmFsc2U7IH1cblxuICAgICAgICByZXR1cm4gaXNFbGVtZW50KHZhbHVlKVxuICAgICAgICAgICAgICAgICAgICAvLyB0aGUgdmFsdWUgaXMgYW4gZWxlbWVudCB0byB1c2UgYXMgYSByZXNpemUgaGFuZGxlXG4gICAgICAgICAgICAgICAgICAgID8gdmFsdWUgPT09IGVsZW1lbnRcbiAgICAgICAgICAgICAgICAgICAgLy8gb3RoZXJ3aXNlIGNoZWNrIGlmIGVsZW1lbnQgbWF0Y2hlcyB2YWx1ZSBhcyBzZWxlY3RvclxuICAgICAgICAgICAgICAgICAgICA6IG1hdGNoZXNVcFRvKGVsZW1lbnQsIHZhbHVlLCBpbnRlcmFjdGFibGVFbGVtZW50KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBkZWZhdWx0QWN0aW9uQ2hlY2tlciAocG9pbnRlciwgaW50ZXJhY3Rpb24sIGVsZW1lbnQpIHtcbiAgICAgICAgdmFyIHJlY3QgPSB0aGlzLmdldFJlY3QoZWxlbWVudCksXG4gICAgICAgICAgICBzaG91bGRSZXNpemUgPSBmYWxzZSxcbiAgICAgICAgICAgIGFjdGlvbiA9IG51bGwsXG4gICAgICAgICAgICByZXNpemVBeGVzID0gbnVsbCxcbiAgICAgICAgICAgIHJlc2l6ZUVkZ2VzLFxuICAgICAgICAgICAgcGFnZSA9IGV4dGVuZCh7fSwgaW50ZXJhY3Rpb24uY3VyQ29vcmRzLnBhZ2UpLFxuICAgICAgICAgICAgb3B0aW9ucyA9IHRoaXMub3B0aW9ucztcblxuICAgICAgICBpZiAoIXJlY3QpIHsgcmV0dXJuIG51bGw7IH1cblxuICAgICAgICBpZiAoYWN0aW9uSXNFbmFibGVkLnJlc2l6ZSAmJiBvcHRpb25zLnJlc2l6ZS5lbmFibGVkKSB7XG4gICAgICAgICAgICB2YXIgcmVzaXplT3B0aW9ucyA9IG9wdGlvbnMucmVzaXplO1xuXG4gICAgICAgICAgICByZXNpemVFZGdlcyA9IHtcbiAgICAgICAgICAgICAgICBsZWZ0OiBmYWxzZSwgcmlnaHQ6IGZhbHNlLCB0b3A6IGZhbHNlLCBib3R0b206IGZhbHNlXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAvLyBpZiB1c2luZyByZXNpemUuZWRnZXNcbiAgICAgICAgICAgIGlmIChpc09iamVjdChyZXNpemVPcHRpb25zLmVkZ2VzKSkge1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGVkZ2UgaW4gcmVzaXplRWRnZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzaXplRWRnZXNbZWRnZV0gPSBjaGVja1Jlc2l6ZUVkZ2UoZWRnZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzaXplT3B0aW9ucy5lZGdlc1tlZGdlXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFnZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXJhY3Rpb24uX2V2ZW50VGFyZ2V0LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZWN0LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNpemVPcHRpb25zLm1hcmdpbiB8fCBtYXJnaW4pO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJlc2l6ZUVkZ2VzLmxlZnQgPSByZXNpemVFZGdlcy5sZWZ0ICYmICFyZXNpemVFZGdlcy5yaWdodDtcbiAgICAgICAgICAgICAgICByZXNpemVFZGdlcy50b3AgID0gcmVzaXplRWRnZXMudG9wICAmJiAhcmVzaXplRWRnZXMuYm90dG9tO1xuXG4gICAgICAgICAgICAgICAgc2hvdWxkUmVzaXplID0gcmVzaXplRWRnZXMubGVmdCB8fCByZXNpemVFZGdlcy5yaWdodCB8fCByZXNpemVFZGdlcy50b3AgfHwgcmVzaXplRWRnZXMuYm90dG9tO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIHJpZ2h0ICA9IG9wdGlvbnMucmVzaXplLmF4aXMgIT09ICd5JyAmJiBwYWdlLnggPiAocmVjdC5yaWdodCAgLSBtYXJnaW4pLFxuICAgICAgICAgICAgICAgICAgICBib3R0b20gPSBvcHRpb25zLnJlc2l6ZS5heGlzICE9PSAneCcgJiYgcGFnZS55ID4gKHJlY3QuYm90dG9tIC0gbWFyZ2luKTtcblxuICAgICAgICAgICAgICAgIHNob3VsZFJlc2l6ZSA9IHJpZ2h0IHx8IGJvdHRvbTtcbiAgICAgICAgICAgICAgICByZXNpemVBeGVzID0gKHJpZ2h0PyAneCcgOiAnJykgKyAoYm90dG9tPyAneScgOiAnJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBhY3Rpb24gPSBzaG91bGRSZXNpemVcbiAgICAgICAgICAgID8gJ3Jlc2l6ZSdcbiAgICAgICAgICAgIDogYWN0aW9uSXNFbmFibGVkLmRyYWcgJiYgb3B0aW9ucy5kcmFnLmVuYWJsZWRcbiAgICAgICAgICAgICAgICA/ICdkcmFnJ1xuICAgICAgICAgICAgICAgIDogbnVsbDtcblxuICAgICAgICBpZiAoYWN0aW9uSXNFbmFibGVkLmdlc3R1cmVcbiAgICAgICAgICAgICYmIGludGVyYWN0aW9uLnBvaW50ZXJJZHMubGVuZ3RoID49MlxuICAgICAgICAgICAgJiYgIShpbnRlcmFjdGlvbi5kcmFnZ2luZyB8fCBpbnRlcmFjdGlvbi5yZXNpemluZykpIHtcbiAgICAgICAgICAgIGFjdGlvbiA9ICdnZXN0dXJlJztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChhY3Rpb24pIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgbmFtZTogYWN0aW9uLFxuICAgICAgICAgICAgICAgIGF4aXM6IHJlc2l6ZUF4ZXMsXG4gICAgICAgICAgICAgICAgZWRnZXM6IHJlc2l6ZUVkZ2VzXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgaWYgYWN0aW9uIGlzIGVuYWJsZWQgZ2xvYmFsbHkgYW5kIHRoZSBjdXJyZW50IHRhcmdldCBzdXBwb3J0cyBpdFxuICAgIC8vIElmIHNvLCByZXR1cm4gdGhlIHZhbGlkYXRlZCBhY3Rpb24uIE90aGVyd2lzZSwgcmV0dXJuIG51bGxcbiAgICBmdW5jdGlvbiB2YWxpZGF0ZUFjdGlvbiAoYWN0aW9uLCBpbnRlcmFjdGFibGUpIHtcbiAgICAgICAgaWYgKCFpc09iamVjdChhY3Rpb24pKSB7IHJldHVybiBudWxsOyB9XG5cbiAgICAgICAgdmFyIGFjdGlvbk5hbWUgPSBhY3Rpb24ubmFtZSxcbiAgICAgICAgICAgIG9wdGlvbnMgPSBpbnRlcmFjdGFibGUub3B0aW9ucztcblxuICAgICAgICBpZiAoKCAgKGFjdGlvbk5hbWUgID09PSAncmVzaXplJyAgICYmIG9wdGlvbnMucmVzaXplLmVuYWJsZWQgKVxuICAgICAgICAgICAgfHwgKGFjdGlvbk5hbWUgICAgICA9PT0gJ2RyYWcnICAgICAmJiBvcHRpb25zLmRyYWcuZW5hYmxlZCAgKVxuICAgICAgICAgICAgfHwgKGFjdGlvbk5hbWUgICAgICA9PT0gJ2dlc3R1cmUnICAmJiBvcHRpb25zLmdlc3R1cmUuZW5hYmxlZCkpXG4gICAgICAgICAgICAmJiBhY3Rpb25Jc0VuYWJsZWRbYWN0aW9uTmFtZV0pIHtcblxuICAgICAgICAgICAgaWYgKGFjdGlvbk5hbWUgPT09ICdyZXNpemUnIHx8IGFjdGlvbk5hbWUgPT09ICdyZXNpemV5eCcpIHtcbiAgICAgICAgICAgICAgICBhY3Rpb25OYW1lID0gJ3Jlc2l6ZXh5JztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGFjdGlvbjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICB2YXIgbGlzdGVuZXJzID0ge30sXG4gICAgICAgIGludGVyYWN0aW9uTGlzdGVuZXJzID0gW1xuICAgICAgICAgICAgJ2RyYWdTdGFydCcsICdkcmFnTW92ZScsICdyZXNpemVTdGFydCcsICdyZXNpemVNb3ZlJywgJ2dlc3R1cmVTdGFydCcsICdnZXN0dXJlTW92ZScsXG4gICAgICAgICAgICAncG9pbnRlck92ZXInLCAncG9pbnRlck91dCcsICdwb2ludGVySG92ZXInLCAnc2VsZWN0b3JEb3duJyxcbiAgICAgICAgICAgICdwb2ludGVyRG93bicsICdwb2ludGVyTW92ZScsICdwb2ludGVyVXAnLCAncG9pbnRlckNhbmNlbCcsICdwb2ludGVyRW5kJyxcbiAgICAgICAgICAgICdhZGRQb2ludGVyJywgJ3JlbW92ZVBvaW50ZXInLCAncmVjb3JkUG9pbnRlcicsICdhdXRvU2Nyb2xsTW92ZSdcbiAgICAgICAgXTtcblxuICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBpbnRlcmFjdGlvbkxpc3RlbmVycy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICB2YXIgbmFtZSA9IGludGVyYWN0aW9uTGlzdGVuZXJzW2ldO1xuXG4gICAgICAgIGxpc3RlbmVyc1tuYW1lXSA9IGRvT25JbnRlcmFjdGlvbnMobmFtZSk7XG4gICAgfVxuXG4gICAgLy8gYm91bmQgdG8gdGhlIGludGVyYWN0YWJsZSBjb250ZXh0IHdoZW4gYSBET00gZXZlbnRcbiAgICAvLyBsaXN0ZW5lciBpcyBhZGRlZCB0byBhIHNlbGVjdG9yIGludGVyYWN0YWJsZVxuICAgIGZ1bmN0aW9uIGRlbGVnYXRlTGlzdGVuZXIgKGV2ZW50LCB1c2VDYXB0dXJlKSB7XG4gICAgICAgIHZhciBmYWtlRXZlbnQgPSB7fSxcbiAgICAgICAgICAgIGRlbGVnYXRlZCA9IGRlbGVnYXRlZEV2ZW50c1tldmVudC50eXBlXSxcbiAgICAgICAgICAgIGV2ZW50VGFyZ2V0ID0gZ2V0QWN0dWFsRWxlbWVudChldmVudC5wYXRoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPyBldmVudC5wYXRoWzBdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgOiBldmVudC50YXJnZXQpLFxuICAgICAgICAgICAgZWxlbWVudCA9IGV2ZW50VGFyZ2V0O1xuXG4gICAgICAgIHVzZUNhcHR1cmUgPSB1c2VDYXB0dXJlPyB0cnVlOiBmYWxzZTtcblxuICAgICAgICAvLyBkdXBsaWNhdGUgdGhlIGV2ZW50IHNvIHRoYXQgY3VycmVudFRhcmdldCBjYW4gYmUgY2hhbmdlZFxuICAgICAgICBmb3IgKHZhciBwcm9wIGluIGV2ZW50KSB7XG4gICAgICAgICAgICBmYWtlRXZlbnRbcHJvcF0gPSBldmVudFtwcm9wXTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZha2VFdmVudC5vcmlnaW5hbEV2ZW50ID0gZXZlbnQ7XG4gICAgICAgIGZha2VFdmVudC5wcmV2ZW50RGVmYXVsdCA9IHByZXZlbnRPcmlnaW5hbERlZmF1bHQ7XG5cbiAgICAgICAgLy8gY2xpbWIgdXAgZG9jdW1lbnQgdHJlZSBsb29raW5nIGZvciBzZWxlY3RvciBtYXRjaGVzXG4gICAgICAgIHdoaWxlIChpc0VsZW1lbnQoZWxlbWVudCkpIHtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZGVsZWdhdGVkLnNlbGVjdG9ycy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIHZhciBzZWxlY3RvciA9IGRlbGVnYXRlZC5zZWxlY3RvcnNbaV0sXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHQgPSBkZWxlZ2F0ZWQuY29udGV4dHNbaV07XG5cbiAgICAgICAgICAgICAgICBpZiAobWF0Y2hlc1NlbGVjdG9yKGVsZW1lbnQsIHNlbGVjdG9yKVxuICAgICAgICAgICAgICAgICAgICAmJiBub2RlQ29udGFpbnMoY29udGV4dCwgZXZlbnRUYXJnZXQpXG4gICAgICAgICAgICAgICAgICAgICYmIG5vZGVDb250YWlucyhjb250ZXh0LCBlbGVtZW50KSkge1xuXG4gICAgICAgICAgICAgICAgICAgIHZhciBsaXN0ZW5lcnMgPSBkZWxlZ2F0ZWQubGlzdGVuZXJzW2ldO1xuXG4gICAgICAgICAgICAgICAgICAgIGZha2VFdmVudC5jdXJyZW50VGFyZ2V0ID0gZWxlbWVudDtcblxuICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGxpc3RlbmVycy5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGxpc3RlbmVyc1tqXVsxXSA9PT0gdXNlQ2FwdHVyZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpc3RlbmVyc1tqXVswXShmYWtlRXZlbnQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBlbGVtZW50ID0gcGFyZW50RWxlbWVudChlbGVtZW50KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGRlbGVnYXRlVXNlQ2FwdHVyZSAoZXZlbnQpIHtcbiAgICAgICAgcmV0dXJuIGRlbGVnYXRlTGlzdGVuZXIuY2FsbCh0aGlzLCBldmVudCwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgaW50ZXJhY3RhYmxlcy5pbmRleE9mRWxlbWVudCA9IGZ1bmN0aW9uIGluZGV4T2ZFbGVtZW50IChlbGVtZW50LCBjb250ZXh0KSB7XG4gICAgICAgIGNvbnRleHQgPSBjb250ZXh0IHx8IGRvY3VtZW50O1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGludGVyYWN0YWJsZSA9IHRoaXNbaV07XG5cbiAgICAgICAgICAgIGlmICgoaW50ZXJhY3RhYmxlLnNlbGVjdG9yID09PSBlbGVtZW50XG4gICAgICAgICAgICAgICAgJiYgKGludGVyYWN0YWJsZS5fY29udGV4dCA9PT0gY29udGV4dCkpXG4gICAgICAgICAgICAgICAgfHwgKCFpbnRlcmFjdGFibGUuc2VsZWN0b3IgJiYgaW50ZXJhY3RhYmxlLl9lbGVtZW50ID09PSBlbGVtZW50KSkge1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIGk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIC0xO1xuICAgIH07XG5cbiAgICBpbnRlcmFjdGFibGVzLmdldCA9IGZ1bmN0aW9uIGludGVyYWN0YWJsZUdldCAoZWxlbWVudCwgb3B0aW9ucykge1xuICAgICAgICByZXR1cm4gdGhpc1t0aGlzLmluZGV4T2ZFbGVtZW50KGVsZW1lbnQsIG9wdGlvbnMgJiYgb3B0aW9ucy5jb250ZXh0KV07XG4gICAgfTtcblxuICAgIGludGVyYWN0YWJsZXMuZm9yRWFjaFNlbGVjdG9yID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGludGVyYWN0YWJsZSA9IHRoaXNbaV07XG5cbiAgICAgICAgICAgIGlmICghaW50ZXJhY3RhYmxlLnNlbGVjdG9yKSB7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciByZXQgPSBjYWxsYmFjayhpbnRlcmFjdGFibGUsIGludGVyYWN0YWJsZS5zZWxlY3RvciwgaW50ZXJhY3RhYmxlLl9jb250ZXh0LCBpLCB0aGlzKTtcblxuICAgICAgICAgICAgaWYgKHJldCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJldDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG5cbiAgICAvKlxcXG4gICAgICogaW50ZXJhY3RcbiAgICAgWyBtZXRob2QgXVxuICAgICAqXG4gICAgICogVGhlIG1ldGhvZHMgb2YgdGhpcyB2YXJpYWJsZSBjYW4gYmUgdXNlZCB0byBzZXQgZWxlbWVudHMgYXNcbiAgICAgKiBpbnRlcmFjdGFibGVzIGFuZCBhbHNvIHRvIGNoYW5nZSB2YXJpb3VzIGRlZmF1bHQgc2V0dGluZ3MuXG4gICAgICpcbiAgICAgKiBDYWxsaW5nIGl0IGFzIGEgZnVuY3Rpb24gYW5kIHBhc3NpbmcgYW4gZWxlbWVudCBvciBhIHZhbGlkIENTUyBzZWxlY3RvclxuICAgICAqIHN0cmluZyByZXR1cm5zIGFuIEludGVyYWN0YWJsZSBvYmplY3Qgd2hpY2ggaGFzIHZhcmlvdXMgbWV0aG9kcyB0b1xuICAgICAqIGNvbmZpZ3VyZSBpdC5cbiAgICAgKlxuICAgICAtIGVsZW1lbnQgKEVsZW1lbnQgfCBzdHJpbmcpIFRoZSBIVE1MIG9yIFNWRyBFbGVtZW50IHRvIGludGVyYWN0IHdpdGggb3IgQ1NTIHNlbGVjdG9yXG4gICAgID0gKG9iamVjdCkgQW4gQEludGVyYWN0YWJsZVxuICAgICAqXG4gICAgID4gVXNhZ2VcbiAgICAgfCBpbnRlcmFjdChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZHJhZ2dhYmxlJykpLmRyYWdnYWJsZSh0cnVlKTtcbiAgICAgfFxuICAgICB8IHZhciByZWN0YWJsZXMgPSBpbnRlcmFjdCgncmVjdCcpO1xuICAgICB8IHJlY3RhYmxlc1xuICAgICB8ICAgICAuZ2VzdHVyYWJsZSh0cnVlKVxuICAgICB8ICAgICAub24oJ2dlc3R1cmVtb3ZlJywgZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgIHwgICAgICAgICAvLyBzb21ldGhpbmcgY29vbC4uLlxuICAgICB8ICAgICB9KVxuICAgICB8ICAgICAuYXV0b1Njcm9sbCh0cnVlKTtcbiAgICBcXCovXG4gICAgZnVuY3Rpb24gaW50ZXJhY3QgKGVsZW1lbnQsIG9wdGlvbnMpIHtcbiAgICAgICAgcmV0dXJuIGludGVyYWN0YWJsZXMuZ2V0KGVsZW1lbnQsIG9wdGlvbnMpIHx8IG5ldyBJbnRlcmFjdGFibGUoZWxlbWVudCwgb3B0aW9ucyk7XG4gICAgfVxuXG4gICAgLypcXFxuICAgICAqIEludGVyYWN0YWJsZVxuICAgICBbIHByb3BlcnR5IF1cbiAgICAgKipcbiAgICAgKiBPYmplY3QgdHlwZSByZXR1cm5lZCBieSBAaW50ZXJhY3RcbiAgICBcXCovXG4gICAgZnVuY3Rpb24gSW50ZXJhY3RhYmxlIChlbGVtZW50LCBvcHRpb25zKSB7XG4gICAgICAgIHRoaXMuX2VsZW1lbnQgPSBlbGVtZW50O1xuICAgICAgICB0aGlzLl9pRXZlbnRzID0gdGhpcy5faUV2ZW50cyB8fCB7fTtcblxuICAgICAgICB2YXIgX3dpbmRvdztcblxuICAgICAgICBpZiAodHJ5U2VsZWN0b3IoZWxlbWVudCkpIHtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0b3IgPSBlbGVtZW50O1xuXG4gICAgICAgICAgICB2YXIgY29udGV4dCA9IG9wdGlvbnMgJiYgb3B0aW9ucy5jb250ZXh0O1xuXG4gICAgICAgICAgICBfd2luZG93ID0gY29udGV4dD8gZ2V0V2luZG93KGNvbnRleHQpIDogd2luZG93O1xuXG4gICAgICAgICAgICBpZiAoY29udGV4dCAmJiAoX3dpbmRvdy5Ob2RlXG4gICAgICAgICAgICAgICAgICAgID8gY29udGV4dCBpbnN0YW5jZW9mIF93aW5kb3cuTm9kZVxuICAgICAgICAgICAgICAgICAgICA6IChpc0VsZW1lbnQoY29udGV4dCkgfHwgY29udGV4dCA9PT0gX3dpbmRvdy5kb2N1bWVudCkpKSB7XG5cbiAgICAgICAgICAgICAgICB0aGlzLl9jb250ZXh0ID0gY29udGV4dDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIF93aW5kb3cgPSBnZXRXaW5kb3coZWxlbWVudCk7XG5cbiAgICAgICAgICAgIGlmIChpc0VsZW1lbnQoZWxlbWVudCwgX3dpbmRvdykpIHtcblxuICAgICAgICAgICAgICAgIGlmIChQb2ludGVyRXZlbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgZXZlbnRzLmFkZCh0aGlzLl9lbGVtZW50LCBwRXZlbnRUeXBlcy5kb3duLCBsaXN0ZW5lcnMucG9pbnRlckRvd24gKTtcbiAgICAgICAgICAgICAgICAgICAgZXZlbnRzLmFkZCh0aGlzLl9lbGVtZW50LCBwRXZlbnRUeXBlcy5tb3ZlLCBsaXN0ZW5lcnMucG9pbnRlckhvdmVyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGV2ZW50cy5hZGQodGhpcy5fZWxlbWVudCwgJ21vdXNlZG93bicgLCBsaXN0ZW5lcnMucG9pbnRlckRvd24gKTtcbiAgICAgICAgICAgICAgICAgICAgZXZlbnRzLmFkZCh0aGlzLl9lbGVtZW50LCAnbW91c2Vtb3ZlJyAsIGxpc3RlbmVycy5wb2ludGVySG92ZXIpO1xuICAgICAgICAgICAgICAgICAgICBldmVudHMuYWRkKHRoaXMuX2VsZW1lbnQsICd0b3VjaHN0YXJ0JywgbGlzdGVuZXJzLnBvaW50ZXJEb3duICk7XG4gICAgICAgICAgICAgICAgICAgIGV2ZW50cy5hZGQodGhpcy5fZWxlbWVudCwgJ3RvdWNobW92ZScgLCBsaXN0ZW5lcnMucG9pbnRlckhvdmVyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9kb2MgPSBfd2luZG93LmRvY3VtZW50O1xuXG4gICAgICAgIGlmICghY29udGFpbnMoZG9jdW1lbnRzLCB0aGlzLl9kb2MpKSB7XG4gICAgICAgICAgICBsaXN0ZW5Ub0RvY3VtZW50KHRoaXMuX2RvYyk7XG4gICAgICAgIH1cblxuICAgICAgICBpbnRlcmFjdGFibGVzLnB1c2godGhpcyk7XG5cbiAgICAgICAgdGhpcy5zZXQob3B0aW9ucyk7XG4gICAgfVxuXG4gICAgSW50ZXJhY3RhYmxlLnByb3RvdHlwZSA9IHtcbiAgICAgICAgc2V0T25FdmVudHM6IGZ1bmN0aW9uIChhY3Rpb24sIHBoYXNlcykge1xuICAgICAgICAgICAgaWYgKGFjdGlvbiA9PT0gJ2Ryb3AnKSB7XG4gICAgICAgICAgICAgICAgaWYgKGlzRnVuY3Rpb24ocGhhc2VzLm9uZHJvcCkgICAgICAgICAgKSB7IHRoaXMub25kcm9wICAgICAgICAgICA9IHBoYXNlcy5vbmRyb3AgICAgICAgICAgOyB9XG4gICAgICAgICAgICAgICAgaWYgKGlzRnVuY3Rpb24ocGhhc2VzLm9uZHJvcGFjdGl2YXRlKSAgKSB7IHRoaXMub25kcm9wYWN0aXZhdGUgICA9IHBoYXNlcy5vbmRyb3BhY3RpdmF0ZSAgOyB9XG4gICAgICAgICAgICAgICAgaWYgKGlzRnVuY3Rpb24ocGhhc2VzLm9uZHJvcGRlYWN0aXZhdGUpKSB7IHRoaXMub25kcm9wZGVhY3RpdmF0ZSA9IHBoYXNlcy5vbmRyb3BkZWFjdGl2YXRlOyB9XG4gICAgICAgICAgICAgICAgaWYgKGlzRnVuY3Rpb24ocGhhc2VzLm9uZHJhZ2VudGVyKSAgICAgKSB7IHRoaXMub25kcmFnZW50ZXIgICAgICA9IHBoYXNlcy5vbmRyYWdlbnRlciAgICAgOyB9XG4gICAgICAgICAgICAgICAgaWYgKGlzRnVuY3Rpb24ocGhhc2VzLm9uZHJhZ2xlYXZlKSAgICAgKSB7IHRoaXMub25kcmFnbGVhdmUgICAgICA9IHBoYXNlcy5vbmRyYWdsZWF2ZSAgICAgOyB9XG4gICAgICAgICAgICAgICAgaWYgKGlzRnVuY3Rpb24ocGhhc2VzLm9uZHJvcG1vdmUpICAgICAgKSB7IHRoaXMub25kcm9wbW92ZSAgICAgICA9IHBoYXNlcy5vbmRyb3Btb3ZlICAgICAgOyB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBhY3Rpb24gPSAnb24nICsgYWN0aW9uO1xuXG4gICAgICAgICAgICAgICAgaWYgKGlzRnVuY3Rpb24ocGhhc2VzLm9uc3RhcnQpICAgICAgICkgeyB0aGlzW2FjdGlvbiArICdzdGFydCcgICAgICAgICBdID0gcGhhc2VzLm9uc3RhcnQgICAgICAgICA7IH1cbiAgICAgICAgICAgICAgICBpZiAoaXNGdW5jdGlvbihwaGFzZXMub25tb3ZlKSAgICAgICAgKSB7IHRoaXNbYWN0aW9uICsgJ21vdmUnICAgICAgICAgIF0gPSBwaGFzZXMub25tb3ZlICAgICAgICAgIDsgfVxuICAgICAgICAgICAgICAgIGlmIChpc0Z1bmN0aW9uKHBoYXNlcy5vbmVuZCkgICAgICAgICApIHsgdGhpc1thY3Rpb24gKyAnZW5kJyAgICAgICAgICAgXSA9IHBoYXNlcy5vbmVuZCAgICAgICAgICAgOyB9XG4gICAgICAgICAgICAgICAgaWYgKGlzRnVuY3Rpb24ocGhhc2VzLm9uaW5lcnRpYXN0YXJ0KSkgeyB0aGlzW2FjdGlvbiArICdpbmVydGlhc3RhcnQnICBdID0gcGhhc2VzLm9uaW5lcnRpYXN0YXJ0ICA7IH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLypcXFxuICAgICAgICAgKiBJbnRlcmFjdGFibGUuZHJhZ2dhYmxlXG4gICAgICAgICBbIG1ldGhvZCBdXG4gICAgICAgICAqXG4gICAgICAgICAqIEdldHMgb3Igc2V0cyB3aGV0aGVyIGRyYWcgYWN0aW9ucyBjYW4gYmUgcGVyZm9ybWVkIG9uIHRoZVxuICAgICAgICAgKiBJbnRlcmFjdGFibGVcbiAgICAgICAgICpcbiAgICAgICAgID0gKGJvb2xlYW4pIEluZGljYXRlcyBpZiB0aGlzIGNhbiBiZSB0aGUgdGFyZ2V0IG9mIGRyYWcgZXZlbnRzXG4gICAgICAgICB8IHZhciBpc0RyYWdnYWJsZSA9IGludGVyYWN0KCd1bCBsaScpLmRyYWdnYWJsZSgpO1xuICAgICAgICAgKiBvclxuICAgICAgICAgLSBvcHRpb25zIChib29sZWFuIHwgb2JqZWN0KSAjb3B0aW9uYWwgdHJ1ZS9mYWxzZSBvciBBbiBvYmplY3Qgd2l0aCBldmVudCBsaXN0ZW5lcnMgdG8gYmUgZmlyZWQgb24gZHJhZyBldmVudHMgKG9iamVjdCBtYWtlcyB0aGUgSW50ZXJhY3RhYmxlIGRyYWdnYWJsZSlcbiAgICAgICAgID0gKG9iamVjdCkgVGhpcyBJbnRlcmFjdGFibGVcbiAgICAgICAgIHwgaW50ZXJhY3QoZWxlbWVudCkuZHJhZ2dhYmxlKHtcbiAgICAgICAgIHwgICAgIG9uc3RhcnQ6IGZ1bmN0aW9uIChldmVudCkge30sXG4gICAgICAgICB8ICAgICBvbm1vdmUgOiBmdW5jdGlvbiAoZXZlbnQpIHt9LFxuICAgICAgICAgfCAgICAgb25lbmQgIDogZnVuY3Rpb24gKGV2ZW50KSB7fSxcbiAgICAgICAgIHxcbiAgICAgICAgIHwgICAgIC8vIHRoZSBheGlzIGluIHdoaWNoIHRoZSBmaXJzdCBtb3ZlbWVudCBtdXN0IGJlXG4gICAgICAgICB8ICAgICAvLyBmb3IgdGhlIGRyYWcgc2VxdWVuY2UgdG8gc3RhcnRcbiAgICAgICAgIHwgICAgIC8vICd4eScgYnkgZGVmYXVsdCAtIGFueSBkaXJlY3Rpb25cbiAgICAgICAgIHwgICAgIGF4aXM6ICd4JyB8fCAneScgfHwgJ3h5JyxcbiAgICAgICAgIHxcbiAgICAgICAgIHwgICAgIC8vIG1heCBudW1iZXIgb2YgZHJhZ3MgdGhhdCBjYW4gaGFwcGVuIGNvbmN1cnJlbnRseVxuICAgICAgICAgfCAgICAgLy8gd2l0aCBlbGVtZW50cyBvZiB0aGlzIEludGVyYWN0YWJsZS4gSW5maW5pdHkgYnkgZGVmYXVsdFxuICAgICAgICAgfCAgICAgbWF4OiBJbmZpbml0eSxcbiAgICAgICAgIHxcbiAgICAgICAgIHwgICAgIC8vIG1heCBudW1iZXIgb2YgZHJhZ3MgdGhhdCBjYW4gdGFyZ2V0IHRoZSBzYW1lIGVsZW1lbnQrSW50ZXJhY3RhYmxlXG4gICAgICAgICB8ICAgICAvLyAxIGJ5IGRlZmF1bHRcbiAgICAgICAgIHwgICAgIG1heFBlckVsZW1lbnQ6IDJcbiAgICAgICAgIHwgfSk7XG4gICAgICAgIFxcKi9cbiAgICAgICAgZHJhZ2dhYmxlOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgaWYgKGlzT2JqZWN0KG9wdGlvbnMpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLmRyYWcuZW5hYmxlZCA9IG9wdGlvbnMuZW5hYmxlZCA9PT0gZmFsc2U/IGZhbHNlOiB0cnVlO1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0UGVyQWN0aW9uKCdkcmFnJywgb3B0aW9ucyk7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRPbkV2ZW50cygnZHJhZycsIG9wdGlvbnMpO1xuXG4gICAgICAgICAgICAgICAgaWYgKC9eeCR8XnkkfF54eSQvLnRlc3Qob3B0aW9ucy5heGlzKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMuZHJhZy5heGlzID0gb3B0aW9ucy5heGlzO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChvcHRpb25zLmF4aXMgPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVsZXRlIHRoaXMub3B0aW9ucy5kcmFnLmF4aXM7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpc0Jvb2wob3B0aW9ucykpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMuZHJhZy5lbmFibGVkID0gb3B0aW9ucztcblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5vcHRpb25zLmRyYWc7XG4gICAgICAgIH0sXG5cbiAgICAgICAgc2V0UGVyQWN0aW9uOiBmdW5jdGlvbiAoYWN0aW9uLCBvcHRpb25zKSB7XG4gICAgICAgICAgICAvLyBmb3IgYWxsIHRoZSBkZWZhdWx0IHBlci1hY3Rpb24gb3B0aW9uc1xuICAgICAgICAgICAgZm9yICh2YXIgb3B0aW9uIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgICAgICAvLyBpZiB0aGlzIG9wdGlvbiBleGlzdHMgZm9yIHRoaXMgYWN0aW9uXG4gICAgICAgICAgICAgICAgaWYgKG9wdGlvbiBpbiBkZWZhdWx0T3B0aW9uc1thY3Rpb25dKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGlmIHRoZSBvcHRpb24gaW4gdGhlIG9wdGlvbnMgYXJnIGlzIGFuIG9iamVjdCB2YWx1ZVxuICAgICAgICAgICAgICAgICAgICBpZiAoaXNPYmplY3Qob3B0aW9uc1tvcHRpb25dKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gZHVwbGljYXRlIHRoZSBvYmplY3RcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMub3B0aW9uc1thY3Rpb25dW29wdGlvbl0gPSBleHRlbmQodGhpcy5vcHRpb25zW2FjdGlvbl1bb3B0aW9uXSB8fCB7fSwgb3B0aW9uc1tvcHRpb25dKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGlzT2JqZWN0KGRlZmF1bHRPcHRpb25zLnBlckFjdGlvbltvcHRpb25dKSAmJiAnZW5hYmxlZCcgaW4gZGVmYXVsdE9wdGlvbnMucGVyQWN0aW9uW29wdGlvbl0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnNbYWN0aW9uXVtvcHRpb25dLmVuYWJsZWQgPSBvcHRpb25zW29wdGlvbl0uZW5hYmxlZCA9PT0gZmFsc2U/IGZhbHNlIDogdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIGlmIChpc0Jvb2wob3B0aW9uc1tvcHRpb25dKSAmJiBpc09iamVjdChkZWZhdWx0T3B0aW9ucy5wZXJBY3Rpb25bb3B0aW9uXSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMub3B0aW9uc1thY3Rpb25dW29wdGlvbl0uZW5hYmxlZCA9IG9wdGlvbnNbb3B0aW9uXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIGlmIChvcHRpb25zW29wdGlvbl0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gb3IgaWYgaXQncyBub3QgdW5kZWZpbmVkLCBkbyBhIHBsYWluIGFzc2lnbm1lbnRcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMub3B0aW9uc1thY3Rpb25dW29wdGlvbl0gPSBvcHRpb25zW29wdGlvbl07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgLypcXFxuICAgICAgICAgKiBJbnRlcmFjdGFibGUuZHJvcHpvbmVcbiAgICAgICAgIFsgbWV0aG9kIF1cbiAgICAgICAgICpcbiAgICAgICAgICogUmV0dXJucyBvciBzZXRzIHdoZXRoZXIgZWxlbWVudHMgY2FuIGJlIGRyb3BwZWQgb250byB0aGlzXG4gICAgICAgICAqIEludGVyYWN0YWJsZSB0byB0cmlnZ2VyIGRyb3AgZXZlbnRzXG4gICAgICAgICAqXG4gICAgICAgICAqIERyb3B6b25lcyBjYW4gcmVjZWl2ZSB0aGUgZm9sbG93aW5nIGV2ZW50czpcbiAgICAgICAgICogIC0gYGRyb3BhY3RpdmF0ZWAgYW5kIGBkcm9wZGVhY3RpdmF0ZWAgd2hlbiBhbiBhY2NlcHRhYmxlIGRyYWcgc3RhcnRzIGFuZCBlbmRzXG4gICAgICAgICAqICAtIGBkcmFnZW50ZXJgIGFuZCBgZHJhZ2xlYXZlYCB3aGVuIGEgZHJhZ2dhYmxlIGVudGVycyBhbmQgbGVhdmVzIHRoZSBkcm9wem9uZVxuICAgICAgICAgKiAgLSBgZHJhZ21vdmVgIHdoZW4gYSBkcmFnZ2FibGUgdGhhdCBoYXMgZW50ZXJlZCB0aGUgZHJvcHpvbmUgaXMgbW92ZWRcbiAgICAgICAgICogIC0gYGRyb3BgIHdoZW4gYSBkcmFnZ2FibGUgaXMgZHJvcHBlZCBpbnRvIHRoaXMgZHJvcHpvbmVcbiAgICAgICAgICpcbiAgICAgICAgICogIFVzZSB0aGUgYGFjY2VwdGAgb3B0aW9uIHRvIGFsbG93IG9ubHkgZWxlbWVudHMgdGhhdCBtYXRjaCB0aGUgZ2l2ZW4gQ1NTIHNlbGVjdG9yIG9yIGVsZW1lbnQuXG4gICAgICAgICAqXG4gICAgICAgICAqICBVc2UgdGhlIGBvdmVybGFwYCBvcHRpb24gdG8gc2V0IGhvdyBkcm9wcyBhcmUgY2hlY2tlZCBmb3IuIFRoZSBhbGxvd2VkIHZhbHVlcyBhcmU6XG4gICAgICAgICAqICAgLSBgJ3BvaW50ZXInYCwgdGhlIHBvaW50ZXIgbXVzdCBiZSBvdmVyIHRoZSBkcm9wem9uZSAoZGVmYXVsdClcbiAgICAgICAgICogICAtIGAnY2VudGVyJ2AsIHRoZSBkcmFnZ2FibGUgZWxlbWVudCdzIGNlbnRlciBtdXN0IGJlIG92ZXIgdGhlIGRyb3B6b25lXG4gICAgICAgICAqICAgLSBhIG51bWJlciBmcm9tIDAtMSB3aGljaCBpcyB0aGUgYChpbnRlcnNlY3Rpb24gYXJlYSkgLyAoZHJhZ2dhYmxlIGFyZWEpYC5cbiAgICAgICAgICogICAgICAgZS5nLiBgMC41YCBmb3IgZHJvcCB0byBoYXBwZW4gd2hlbiBoYWxmIG9mIHRoZSBhcmVhIG9mIHRoZVxuICAgICAgICAgKiAgICAgICBkcmFnZ2FibGUgaXMgb3ZlciB0aGUgZHJvcHpvbmVcbiAgICAgICAgICpcbiAgICAgICAgIC0gb3B0aW9ucyAoYm9vbGVhbiB8IG9iamVjdCB8IG51bGwpICNvcHRpb25hbCBUaGUgbmV3IHZhbHVlIHRvIGJlIHNldC5cbiAgICAgICAgIHwgaW50ZXJhY3QoJy5kcm9wJykuZHJvcHpvbmUoe1xuICAgICAgICAgfCAgIGFjY2VwdDogJy5jYW4tZHJvcCcgfHwgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbmdsZS1kcm9wJyksXG4gICAgICAgICB8ICAgb3ZlcmxhcDogJ3BvaW50ZXInIHx8ICdjZW50ZXInIHx8IHplcm9Ub09uZVxuICAgICAgICAgfCB9XG4gICAgICAgICA9IChib29sZWFuIHwgb2JqZWN0KSBUaGUgY3VycmVudCBzZXR0aW5nIG9yIHRoaXMgSW50ZXJhY3RhYmxlXG4gICAgICAgIFxcKi9cbiAgICAgICAgZHJvcHpvbmU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICBpZiAoaXNPYmplY3Qob3B0aW9ucykpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMuZHJvcC5lbmFibGVkID0gb3B0aW9ucy5lbmFibGVkID09PSBmYWxzZT8gZmFsc2U6IHRydWU7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRPbkV2ZW50cygnZHJvcCcsIG9wdGlvbnMpO1xuXG4gICAgICAgICAgICAgICAgaWYgKC9eKHBvaW50ZXJ8Y2VudGVyKSQvLnRlc3Qob3B0aW9ucy5vdmVybGFwKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMuZHJvcC5vdmVybGFwID0gb3B0aW9ucy5vdmVybGFwO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChpc051bWJlcihvcHRpb25zLm92ZXJsYXApKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMub3B0aW9ucy5kcm9wLm92ZXJsYXAgPSBNYXRoLm1heChNYXRoLm1pbigxLCBvcHRpb25zLm92ZXJsYXApLCAwKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKCdhY2NlcHQnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgICAgICAgIHRoaXMub3B0aW9ucy5kcm9wLmFjY2VwdCA9IG9wdGlvbnMuYWNjZXB0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoJ2NoZWNrZXInIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgICAgICAgIHRoaXMub3B0aW9ucy5kcm9wLmNoZWNrZXIgPSBvcHRpb25zLmNoZWNrZXI7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpc0Jvb2wob3B0aW9ucykpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMuZHJvcC5lbmFibGVkID0gb3B0aW9ucztcblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5vcHRpb25zLmRyb3A7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZHJvcENoZWNrOiBmdW5jdGlvbiAoZHJhZ0V2ZW50LCBldmVudCwgZHJhZ2dhYmxlLCBkcmFnZ2FibGVFbGVtZW50LCBkcm9wRWxlbWVudCwgcmVjdCkge1xuICAgICAgICAgICAgdmFyIGRyb3BwZWQgPSBmYWxzZTtcblxuICAgICAgICAgICAgLy8gaWYgdGhlIGRyb3B6b25lIGhhcyBubyByZWN0IChlZy4gZGlzcGxheTogbm9uZSlcbiAgICAgICAgICAgIC8vIGNhbGwgdGhlIGN1c3RvbSBkcm9wQ2hlY2tlciBvciBqdXN0IHJldHVybiBmYWxzZVxuICAgICAgICAgICAgaWYgKCEocmVjdCA9IHJlY3QgfHwgdGhpcy5nZXRSZWN0KGRyb3BFbGVtZW50KSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gKHRoaXMub3B0aW9ucy5kcm9wLmNoZWNrZXJcbiAgICAgICAgICAgICAgICAgICAgPyB0aGlzLm9wdGlvbnMuZHJvcC5jaGVja2VyKGRyYWdFdmVudCwgZXZlbnQsIGRyb3BwZWQsIHRoaXMsIGRyb3BFbGVtZW50LCBkcmFnZ2FibGUsIGRyYWdnYWJsZUVsZW1lbnQpXG4gICAgICAgICAgICAgICAgICAgIDogZmFsc2UpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgZHJvcE92ZXJsYXAgPSB0aGlzLm9wdGlvbnMuZHJvcC5vdmVybGFwO1xuXG4gICAgICAgICAgICBpZiAoZHJvcE92ZXJsYXAgPT09ICdwb2ludGVyJykge1xuICAgICAgICAgICAgICAgIHZhciBwYWdlID0gZ2V0UGFnZVhZKGRyYWdFdmVudCksXG4gICAgICAgICAgICAgICAgICAgIG9yaWdpbiA9IGdldE9yaWdpblhZKGRyYWdnYWJsZSwgZHJhZ2dhYmxlRWxlbWVudCksXG4gICAgICAgICAgICAgICAgICAgIGhvcml6b250YWwsXG4gICAgICAgICAgICAgICAgICAgIHZlcnRpY2FsO1xuXG4gICAgICAgICAgICAgICAgcGFnZS54ICs9IG9yaWdpbi54O1xuICAgICAgICAgICAgICAgIHBhZ2UueSArPSBvcmlnaW4ueTtcblxuICAgICAgICAgICAgICAgIGhvcml6b250YWwgPSAocGFnZS54ID4gcmVjdC5sZWZ0KSAmJiAocGFnZS54IDwgcmVjdC5yaWdodCk7XG4gICAgICAgICAgICAgICAgdmVydGljYWwgICA9IChwYWdlLnkgPiByZWN0LnRvcCApICYmIChwYWdlLnkgPCByZWN0LmJvdHRvbSk7XG5cbiAgICAgICAgICAgICAgICBkcm9wcGVkID0gaG9yaXpvbnRhbCAmJiB2ZXJ0aWNhbDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGRyYWdSZWN0ID0gZHJhZ2dhYmxlLmdldFJlY3QoZHJhZ2dhYmxlRWxlbWVudCk7XG5cbiAgICAgICAgICAgIGlmIChkcm9wT3ZlcmxhcCA9PT0gJ2NlbnRlcicpIHtcbiAgICAgICAgICAgICAgICB2YXIgY3ggPSBkcmFnUmVjdC5sZWZ0ICsgZHJhZ1JlY3Qud2lkdGggIC8gMixcbiAgICAgICAgICAgICAgICAgICAgY3kgPSBkcmFnUmVjdC50b3AgICsgZHJhZ1JlY3QuaGVpZ2h0IC8gMjtcblxuICAgICAgICAgICAgICAgIGRyb3BwZWQgPSBjeCA+PSByZWN0LmxlZnQgJiYgY3ggPD0gcmVjdC5yaWdodCAmJiBjeSA+PSByZWN0LnRvcCAmJiBjeSA8PSByZWN0LmJvdHRvbTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGlzTnVtYmVyKGRyb3BPdmVybGFwKSkge1xuICAgICAgICAgICAgICAgIHZhciBvdmVybGFwQXJlYSAgPSAoTWF0aC5tYXgoMCwgTWF0aC5taW4ocmVjdC5yaWdodCAsIGRyYWdSZWN0LnJpZ2h0ICkgLSBNYXRoLm1heChyZWN0LmxlZnQsIGRyYWdSZWN0LmxlZnQpKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICogTWF0aC5tYXgoMCwgTWF0aC5taW4ocmVjdC5ib3R0b20sIGRyYWdSZWN0LmJvdHRvbSkgLSBNYXRoLm1heChyZWN0LnRvcCAsIGRyYWdSZWN0LnRvcCApKSksXG4gICAgICAgICAgICAgICAgICAgIG92ZXJsYXBSYXRpbyA9IG92ZXJsYXBBcmVhIC8gKGRyYWdSZWN0LndpZHRoICogZHJhZ1JlY3QuaGVpZ2h0KTtcblxuICAgICAgICAgICAgICAgIGRyb3BwZWQgPSBvdmVybGFwUmF0aW8gPj0gZHJvcE92ZXJsYXA7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0aGlzLm9wdGlvbnMuZHJvcC5jaGVja2VyKSB7XG4gICAgICAgICAgICAgICAgZHJvcHBlZCA9IHRoaXMub3B0aW9ucy5kcm9wLmNoZWNrZXIoZHJhZ0V2ZW50LCBldmVudCwgZHJvcHBlZCwgdGhpcywgZHJvcEVsZW1lbnQsIGRyYWdnYWJsZSwgZHJhZ2dhYmxlRWxlbWVudCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBkcm9wcGVkO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qXFxcbiAgICAgICAgICogSW50ZXJhY3RhYmxlLmRyb3BDaGVja2VyXG4gICAgICAgICBbIG1ldGhvZCBdXG4gICAgICAgICAqXG4gICAgICAgICAqIERFUFJFQ0FURUQuIFVzZSBpbnRlcmFjdGFibGUuZHJvcHpvbmUoeyBjaGVja2VyOiBmdW5jdGlvbi4uLiB9KSBpbnN0ZWFkLlxuICAgICAgICAgKlxuICAgICAgICAgKiBHZXRzIG9yIHNldHMgdGhlIGZ1bmN0aW9uIHVzZWQgdG8gY2hlY2sgaWYgYSBkcmFnZ2VkIGVsZW1lbnQgaXNcbiAgICAgICAgICogb3ZlciB0aGlzIEludGVyYWN0YWJsZS5cbiAgICAgICAgICpcbiAgICAgICAgIC0gY2hlY2tlciAoZnVuY3Rpb24pICNvcHRpb25hbCBUaGUgZnVuY3Rpb24gdGhhdCB3aWxsIGJlIGNhbGxlZCB3aGVuIGNoZWNraW5nIGZvciBhIGRyb3BcbiAgICAgICAgID0gKEZ1bmN0aW9uIHwgSW50ZXJhY3RhYmxlKSBUaGUgY2hlY2tlciBmdW5jdGlvbiBvciB0aGlzIEludGVyYWN0YWJsZVxuICAgICAgICAgKlxuICAgICAgICAgKiBUaGUgY2hlY2tlciBmdW5jdGlvbiB0YWtlcyB0aGUgZm9sbG93aW5nIGFyZ3VtZW50czpcbiAgICAgICAgICpcbiAgICAgICAgIC0gZHJhZ0V2ZW50IChJbnRlcmFjdEV2ZW50KSBUaGUgcmVsYXRlZCBkcmFnbW92ZSBvciBkcmFnZW5kIGV2ZW50XG4gICAgICAgICAtIGV2ZW50IChUb3VjaEV2ZW50IHwgUG9pbnRlckV2ZW50IHwgTW91c2VFdmVudCkgVGhlIHVzZXIgbW92ZS91cC9lbmQgRXZlbnQgcmVsYXRlZCB0byB0aGUgZHJhZ0V2ZW50XG4gICAgICAgICAtIGRyb3BwZWQgKGJvb2xlYW4pIFRoZSB2YWx1ZSBmcm9tIHRoZSBkZWZhdWx0IGRyb3AgY2hlY2tlclxuICAgICAgICAgLSBkcm9wem9uZSAoSW50ZXJhY3RhYmxlKSBUaGUgZHJvcHpvbmUgaW50ZXJhY3RhYmxlXG4gICAgICAgICAtIGRyb3BFbGVtZW50IChFbGVtZW50KSBUaGUgZHJvcHpvbmUgZWxlbWVudFxuICAgICAgICAgLSBkcmFnZ2FibGUgKEludGVyYWN0YWJsZSkgVGhlIEludGVyYWN0YWJsZSBiZWluZyBkcmFnZ2VkXG4gICAgICAgICAtIGRyYWdnYWJsZUVsZW1lbnQgKEVsZW1lbnQpIFRoZSBhY3R1YWwgZWxlbWVudCB0aGF0J3MgYmVpbmcgZHJhZ2dlZFxuICAgICAgICAgKlxuICAgICAgICAgPiBVc2FnZTpcbiAgICAgICAgIHwgaW50ZXJhY3QodGFyZ2V0KVxuICAgICAgICAgfCAuZHJvcENoZWNrZXIoZnVuY3Rpb24oZHJhZ0V2ZW50LCAgICAgICAgIC8vIHJlbGF0ZWQgZHJhZ21vdmUgb3IgZHJhZ2VuZCBldmVudFxuICAgICAgICAgfCAgICAgICAgICAgICAgICAgICAgICAgZXZlbnQsICAgICAgICAgICAgIC8vIFRvdWNoRXZlbnQvUG9pbnRlckV2ZW50L01vdXNlRXZlbnRcbiAgICAgICAgIHwgICAgICAgICAgICAgICAgICAgICAgIGRyb3BwZWQsICAgICAgICAgICAvLyBib29sIHJlc3VsdCBvZiB0aGUgZGVmYXVsdCBjaGVja2VyXG4gICAgICAgICB8ICAgICAgICAgICAgICAgICAgICAgICBkcm9wem9uZSwgICAgICAgICAgLy8gZHJvcHpvbmUgSW50ZXJhY3RhYmxlXG4gICAgICAgICB8ICAgICAgICAgICAgICAgICAgICAgICBkcm9wRWxlbWVudCwgICAgICAgLy8gZHJvcHpvbmUgZWxlbW50XG4gICAgICAgICB8ICAgICAgICAgICAgICAgICAgICAgICBkcmFnZ2FibGUsICAgICAgICAgLy8gZHJhZ2dhYmxlIEludGVyYWN0YWJsZVxuICAgICAgICAgfCAgICAgICAgICAgICAgICAgICAgICAgZHJhZ2dhYmxlRWxlbWVudCkgey8vIGRyYWdnYWJsZSBlbGVtZW50XG4gICAgICAgICB8XG4gICAgICAgICB8ICAgcmV0dXJuIGRyb3BwZWQgJiYgZXZlbnQudGFyZ2V0Lmhhc0F0dHJpYnV0ZSgnYWxsb3ctZHJvcCcpO1xuICAgICAgICAgfCB9XG4gICAgICAgIFxcKi9cbiAgICAgICAgZHJvcENoZWNrZXI6IGZ1bmN0aW9uIChjaGVja2VyKSB7XG4gICAgICAgICAgICBpZiAoaXNGdW5jdGlvbihjaGVja2VyKSkge1xuICAgICAgICAgICAgICAgIHRoaXMub3B0aW9ucy5kcm9wLmNoZWNrZXIgPSBjaGVja2VyO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoY2hlY2tlciA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGRlbGV0ZSB0aGlzLm9wdGlvbnMuZ2V0UmVjdDtcblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5vcHRpb25zLmRyb3AuY2hlY2tlcjtcbiAgICAgICAgfSxcblxuICAgICAgICAvKlxcXG4gICAgICAgICAqIEludGVyYWN0YWJsZS5hY2NlcHRcbiAgICAgICAgIFsgbWV0aG9kIF1cbiAgICAgICAgICpcbiAgICAgICAgICogRGVwcmVjYXRlZC4gYWRkIGFuIGBhY2NlcHRgIHByb3BlcnR5IHRvIHRoZSBvcHRpb25zIG9iamVjdCBwYXNzZWQgdG9cbiAgICAgICAgICogQEludGVyYWN0YWJsZS5kcm9wem9uZSBpbnN0ZWFkLlxuICAgICAgICAgKlxuICAgICAgICAgKiBHZXRzIG9yIHNldHMgdGhlIEVsZW1lbnQgb3IgQ1NTIHNlbGVjdG9yIG1hdGNoIHRoYXQgdGhpc1xuICAgICAgICAgKiBJbnRlcmFjdGFibGUgYWNjZXB0cyBpZiBpdCBpcyBhIGRyb3B6b25lLlxuICAgICAgICAgKlxuICAgICAgICAgLSBuZXdWYWx1ZSAoRWxlbWVudCB8IHN0cmluZyB8IG51bGwpICNvcHRpb25hbFxuICAgICAgICAgKiBJZiBpdCBpcyBhbiBFbGVtZW50LCB0aGVuIG9ubHkgdGhhdCBlbGVtZW50IGNhbiBiZSBkcm9wcGVkIGludG8gdGhpcyBkcm9wem9uZS5cbiAgICAgICAgICogSWYgaXQgaXMgYSBzdHJpbmcsIHRoZSBlbGVtZW50IGJlaW5nIGRyYWdnZWQgbXVzdCBtYXRjaCBpdCBhcyBhIHNlbGVjdG9yLlxuICAgICAgICAgKiBJZiBpdCBpcyBudWxsLCB0aGUgYWNjZXB0IG9wdGlvbnMgaXMgY2xlYXJlZCAtIGl0IGFjY2VwdHMgYW55IGVsZW1lbnQuXG4gICAgICAgICAqXG4gICAgICAgICA9IChzdHJpbmcgfCBFbGVtZW50IHwgbnVsbCB8IEludGVyYWN0YWJsZSkgVGhlIGN1cnJlbnQgYWNjZXB0IG9wdGlvbiBpZiBnaXZlbiBgdW5kZWZpbmVkYCBvciB0aGlzIEludGVyYWN0YWJsZVxuICAgICAgICBcXCovXG4gICAgICAgIGFjY2VwdDogZnVuY3Rpb24gKG5ld1ZhbHVlKSB7XG4gICAgICAgICAgICBpZiAoaXNFbGVtZW50KG5ld1ZhbHVlKSkge1xuICAgICAgICAgICAgICAgIHRoaXMub3B0aW9ucy5kcm9wLmFjY2VwdCA9IG5ld1ZhbHVlO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHRlc3QgaWYgaXQgaXMgYSB2YWxpZCBDU1Mgc2VsZWN0b3JcbiAgICAgICAgICAgIGlmICh0cnlTZWxlY3RvcihuZXdWYWx1ZSkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMuZHJvcC5hY2NlcHQgPSBuZXdWYWx1ZTtcblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAobmV3VmFsdWUgPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBkZWxldGUgdGhpcy5vcHRpb25zLmRyb3AuYWNjZXB0O1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzLm9wdGlvbnMuZHJvcC5hY2NlcHQ7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLypcXFxuICAgICAgICAgKiBJbnRlcmFjdGFibGUucmVzaXphYmxlXG4gICAgICAgICBbIG1ldGhvZCBdXG4gICAgICAgICAqXG4gICAgICAgICAqIEdldHMgb3Igc2V0cyB3aGV0aGVyIHJlc2l6ZSBhY3Rpb25zIGNhbiBiZSBwZXJmb3JtZWQgb24gdGhlXG4gICAgICAgICAqIEludGVyYWN0YWJsZVxuICAgICAgICAgKlxuICAgICAgICAgPSAoYm9vbGVhbikgSW5kaWNhdGVzIGlmIHRoaXMgY2FuIGJlIHRoZSB0YXJnZXQgb2YgcmVzaXplIGVsZW1lbnRzXG4gICAgICAgICB8IHZhciBpc1Jlc2l6ZWFibGUgPSBpbnRlcmFjdCgnaW5wdXRbdHlwZT10ZXh0XScpLnJlc2l6YWJsZSgpO1xuICAgICAgICAgKiBvclxuICAgICAgICAgLSBvcHRpb25zIChib29sZWFuIHwgb2JqZWN0KSAjb3B0aW9uYWwgdHJ1ZS9mYWxzZSBvciBBbiBvYmplY3Qgd2l0aCBldmVudCBsaXN0ZW5lcnMgdG8gYmUgZmlyZWQgb24gcmVzaXplIGV2ZW50cyAob2JqZWN0IG1ha2VzIHRoZSBJbnRlcmFjdGFibGUgcmVzaXphYmxlKVxuICAgICAgICAgPSAob2JqZWN0KSBUaGlzIEludGVyYWN0YWJsZVxuICAgICAgICAgfCBpbnRlcmFjdChlbGVtZW50KS5yZXNpemFibGUoe1xuICAgICAgICAgfCAgICAgb25zdGFydDogZnVuY3Rpb24gKGV2ZW50KSB7fSxcbiAgICAgICAgIHwgICAgIG9ubW92ZSA6IGZ1bmN0aW9uIChldmVudCkge30sXG4gICAgICAgICB8ICAgICBvbmVuZCAgOiBmdW5jdGlvbiAoZXZlbnQpIHt9LFxuICAgICAgICAgfFxuICAgICAgICAgfCAgICAgZWRnZXM6IHtcbiAgICAgICAgIHwgICAgICAgdG9wICAgOiB0cnVlLCAgICAgICAvLyBVc2UgcG9pbnRlciBjb29yZHMgdG8gY2hlY2sgZm9yIHJlc2l6ZS5cbiAgICAgICAgIHwgICAgICAgbGVmdCAgOiBmYWxzZSwgICAgICAvLyBEaXNhYmxlIHJlc2l6aW5nIGZyb20gbGVmdCBlZGdlLlxuICAgICAgICAgfCAgICAgICBib3R0b206ICcucmVzaXplLXMnLC8vIFJlc2l6ZSBpZiBwb2ludGVyIHRhcmdldCBtYXRjaGVzIHNlbGVjdG9yXG4gICAgICAgICB8ICAgICAgIHJpZ2h0IDogaGFuZGxlRWwgICAgLy8gUmVzaXplIGlmIHBvaW50ZXIgdGFyZ2V0IGlzIHRoZSBnaXZlbiBFbGVtZW50XG4gICAgICAgICB8ICAgICB9LFxuICAgICAgICAgfFxuICAgICAgICAgfCAgICAgLy8gV2lkdGggYW5kIGhlaWdodCBjYW4gYmUgYWRqdXN0ZWQgaW5kZXBlbmRlbnRseS4gV2hlbiBgdHJ1ZWAsIHdpZHRoIGFuZFxuICAgICAgICAgfCAgICAgLy8gaGVpZ2h0IGFyZSBhZGp1c3RlZCBhdCBhIDE6MSByYXRpby5cbiAgICAgICAgIHwgICAgIHNxdWFyZTogZmFsc2UsXG4gICAgICAgICB8XG4gICAgICAgICB8ICAgICAvLyBXaWR0aCBhbmQgaGVpZ2h0IGNhbiBiZSBhZGp1c3RlZCBpbmRlcGVuZGVudGx5LiBXaGVuIGB0cnVlYCwgd2lkdGggYW5kXG4gICAgICAgICB8ICAgICAvLyBoZWlnaHQgbWFpbnRhaW4gdGhlIGFzcGVjdCByYXRpbyB0aGV5IGhhZCB3aGVuIHJlc2l6aW5nIHN0YXJ0ZWQuXG4gICAgICAgICB8ICAgICBwcmVzZXJ2ZUFzcGVjdFJhdGlvOiBmYWxzZSxcbiAgICAgICAgIHxcbiAgICAgICAgIHwgICAgIC8vIGEgdmFsdWUgb2YgJ25vbmUnIHdpbGwgbGltaXQgdGhlIHJlc2l6ZSByZWN0IHRvIGEgbWluaW11bSBvZiAweDBcbiAgICAgICAgIHwgICAgIC8vICduZWdhdGUnIHdpbGwgYWxsb3cgdGhlIHJlY3QgdG8gaGF2ZSBuZWdhdGl2ZSB3aWR0aC9oZWlnaHRcbiAgICAgICAgIHwgICAgIC8vICdyZXBvc2l0aW9uJyB3aWxsIGtlZXAgdGhlIHdpZHRoL2hlaWdodCBwb3NpdGl2ZSBieSBzd2FwcGluZ1xuICAgICAgICAgfCAgICAgLy8gdGhlIHRvcCBhbmQgYm90dG9tIGVkZ2VzIGFuZC9vciBzd2FwcGluZyB0aGUgbGVmdCBhbmQgcmlnaHQgZWRnZXNcbiAgICAgICAgIHwgICAgIGludmVydDogJ25vbmUnIHx8ICduZWdhdGUnIHx8ICdyZXBvc2l0aW9uJ1xuICAgICAgICAgfFxuICAgICAgICAgfCAgICAgLy8gbGltaXQgbXVsdGlwbGUgcmVzaXplcy5cbiAgICAgICAgIHwgICAgIC8vIFNlZSB0aGUgZXhwbGFuYXRpb24gaW4gdGhlIEBJbnRlcmFjdGFibGUuZHJhZ2dhYmxlIGV4YW1wbGVcbiAgICAgICAgIHwgICAgIG1heDogSW5maW5pdHksXG4gICAgICAgICB8ICAgICBtYXhQZXJFbGVtZW50OiAxLFxuICAgICAgICAgfCB9KTtcbiAgICAgICAgXFwqL1xuICAgICAgICByZXNpemFibGU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICBpZiAoaXNPYmplY3Qob3B0aW9ucykpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMucmVzaXplLmVuYWJsZWQgPSBvcHRpb25zLmVuYWJsZWQgPT09IGZhbHNlPyBmYWxzZTogdHJ1ZTtcbiAgICAgICAgICAgICAgICB0aGlzLnNldFBlckFjdGlvbigncmVzaXplJywgb3B0aW9ucyk7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRPbkV2ZW50cygncmVzaXplJywgb3B0aW9ucyk7XG5cbiAgICAgICAgICAgICAgICBpZiAoL154JHxeeSR8Xnh5JC8udGVzdChvcHRpb25zLmF4aXMpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMub3B0aW9ucy5yZXNpemUuYXhpcyA9IG9wdGlvbnMuYXhpcztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAob3B0aW9ucy5heGlzID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMub3B0aW9ucy5yZXNpemUuYXhpcyA9IGRlZmF1bHRPcHRpb25zLnJlc2l6ZS5heGlzO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChpc0Jvb2wob3B0aW9ucy5wcmVzZXJ2ZUFzcGVjdFJhdGlvKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMucmVzaXplLnByZXNlcnZlQXNwZWN0UmF0aW8gPSBvcHRpb25zLnByZXNlcnZlQXNwZWN0UmF0aW87XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKGlzQm9vbChvcHRpb25zLnNxdWFyZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLnJlc2l6ZS5zcXVhcmUgPSBvcHRpb25zLnNxdWFyZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpc0Jvb2wob3B0aW9ucykpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMucmVzaXplLmVuYWJsZWQgPSBvcHRpb25zO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5vcHRpb25zLnJlc2l6ZTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKlxcXG4gICAgICAgICAqIEludGVyYWN0YWJsZS5zcXVhcmVSZXNpemVcbiAgICAgICAgIFsgbWV0aG9kIF1cbiAgICAgICAgICpcbiAgICAgICAgICogRGVwcmVjYXRlZC4gQWRkIGEgYHNxdWFyZTogdHJ1ZSB8fCBmYWxzZWAgcHJvcGVydHkgdG8gQEludGVyYWN0YWJsZS5yZXNpemFibGUgaW5zdGVhZFxuICAgICAgICAgKlxuICAgICAgICAgKiBHZXRzIG9yIHNldHMgd2hldGhlciByZXNpemluZyBpcyBmb3JjZWQgMToxIGFzcGVjdFxuICAgICAgICAgKlxuICAgICAgICAgPSAoYm9vbGVhbikgQ3VycmVudCBzZXR0aW5nXG4gICAgICAgICAqXG4gICAgICAgICAqIG9yXG4gICAgICAgICAqXG4gICAgICAgICAtIG5ld1ZhbHVlIChib29sZWFuKSAjb3B0aW9uYWxcbiAgICAgICAgID0gKG9iamVjdCkgdGhpcyBJbnRlcmFjdGFibGVcbiAgICAgICAgXFwqL1xuICAgICAgICBzcXVhcmVSZXNpemU6IGZ1bmN0aW9uIChuZXdWYWx1ZSkge1xuICAgICAgICAgICAgaWYgKGlzQm9vbChuZXdWYWx1ZSkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMucmVzaXplLnNxdWFyZSA9IG5ld1ZhbHVlO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChuZXdWYWx1ZSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGRlbGV0ZSB0aGlzLm9wdGlvbnMucmVzaXplLnNxdWFyZTtcblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5vcHRpb25zLnJlc2l6ZS5zcXVhcmU7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLypcXFxuICAgICAgICAgKiBJbnRlcmFjdGFibGUuZ2VzdHVyYWJsZVxuICAgICAgICAgWyBtZXRob2QgXVxuICAgICAgICAgKlxuICAgICAgICAgKiBHZXRzIG9yIHNldHMgd2hldGhlciBtdWx0aXRvdWNoIGdlc3R1cmVzIGNhbiBiZSBwZXJmb3JtZWQgb24gdGhlXG4gICAgICAgICAqIEludGVyYWN0YWJsZSdzIGVsZW1lbnRcbiAgICAgICAgICpcbiAgICAgICAgID0gKGJvb2xlYW4pIEluZGljYXRlcyBpZiB0aGlzIGNhbiBiZSB0aGUgdGFyZ2V0IG9mIGdlc3R1cmUgZXZlbnRzXG4gICAgICAgICB8IHZhciBpc0dlc3R1cmVhYmxlID0gaW50ZXJhY3QoZWxlbWVudCkuZ2VzdHVyYWJsZSgpO1xuICAgICAgICAgKiBvclxuICAgICAgICAgLSBvcHRpb25zIChib29sZWFuIHwgb2JqZWN0KSAjb3B0aW9uYWwgdHJ1ZS9mYWxzZSBvciBBbiBvYmplY3Qgd2l0aCBldmVudCBsaXN0ZW5lcnMgdG8gYmUgZmlyZWQgb24gZ2VzdHVyZSBldmVudHMgKG1ha2VzIHRoZSBJbnRlcmFjdGFibGUgZ2VzdHVyYWJsZSlcbiAgICAgICAgID0gKG9iamVjdCkgdGhpcyBJbnRlcmFjdGFibGVcbiAgICAgICAgIHwgaW50ZXJhY3QoZWxlbWVudCkuZ2VzdHVyYWJsZSh7XG4gICAgICAgICB8ICAgICBvbnN0YXJ0OiBmdW5jdGlvbiAoZXZlbnQpIHt9LFxuICAgICAgICAgfCAgICAgb25tb3ZlIDogZnVuY3Rpb24gKGV2ZW50KSB7fSxcbiAgICAgICAgIHwgICAgIG9uZW5kICA6IGZ1bmN0aW9uIChldmVudCkge30sXG4gICAgICAgICB8XG4gICAgICAgICB8ICAgICAvLyBsaW1pdCBtdWx0aXBsZSBnZXN0dXJlcy5cbiAgICAgICAgIHwgICAgIC8vIFNlZSB0aGUgZXhwbGFuYXRpb24gaW4gQEludGVyYWN0YWJsZS5kcmFnZ2FibGUgZXhhbXBsZVxuICAgICAgICAgfCAgICAgbWF4OiBJbmZpbml0eSxcbiAgICAgICAgIHwgICAgIG1heFBlckVsZW1lbnQ6IDEsXG4gICAgICAgICB8IH0pO1xuICAgICAgICBcXCovXG4gICAgICAgIGdlc3R1cmFibGU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICBpZiAoaXNPYmplY3Qob3B0aW9ucykpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMuZ2VzdHVyZS5lbmFibGVkID0gb3B0aW9ucy5lbmFibGVkID09PSBmYWxzZT8gZmFsc2U6IHRydWU7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRQZXJBY3Rpb24oJ2dlc3R1cmUnLCBvcHRpb25zKTtcbiAgICAgICAgICAgICAgICB0aGlzLnNldE9uRXZlbnRzKCdnZXN0dXJlJywgb3B0aW9ucyk7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGlzQm9vbChvcHRpb25zKSkge1xuICAgICAgICAgICAgICAgIHRoaXMub3B0aW9ucy5nZXN0dXJlLmVuYWJsZWQgPSBvcHRpb25zO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzLm9wdGlvbnMuZ2VzdHVyZTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKlxcXG4gICAgICAgICAqIEludGVyYWN0YWJsZS5hdXRvU2Nyb2xsXG4gICAgICAgICBbIG1ldGhvZCBdXG4gICAgICAgICAqKlxuICAgICAgICAgKiBEZXByZWNhdGVkLiBBZGQgYW4gYGF1dG9zY3JvbGxgIHByb3BlcnR5IHRvIHRoZSBvcHRpb25zIG9iamVjdFxuICAgICAgICAgKiBwYXNzZWQgdG8gQEludGVyYWN0YWJsZS5kcmFnZ2FibGUgb3IgQEludGVyYWN0YWJsZS5yZXNpemFibGUgaW5zdGVhZC5cbiAgICAgICAgICpcbiAgICAgICAgICogUmV0dXJucyBvciBzZXRzIHdoZXRoZXIgZHJhZ2dpbmcgYW5kIHJlc2l6aW5nIG5lYXIgdGhlIGVkZ2VzIG9mIHRoZVxuICAgICAgICAgKiB3aW5kb3cvY29udGFpbmVyIHRyaWdnZXIgYXV0b1Njcm9sbCBmb3IgdGhpcyBJbnRlcmFjdGFibGVcbiAgICAgICAgICpcbiAgICAgICAgID0gKG9iamVjdCkgT2JqZWN0IHdpdGggYXV0b1Njcm9sbCBwcm9wZXJ0aWVzXG4gICAgICAgICAqXG4gICAgICAgICAqIG9yXG4gICAgICAgICAqXG4gICAgICAgICAtIG9wdGlvbnMgKG9iamVjdCB8IGJvb2xlYW4pICNvcHRpb25hbFxuICAgICAgICAgKiBvcHRpb25zIGNhbiBiZTpcbiAgICAgICAgICogLSBhbiBvYmplY3Qgd2l0aCBtYXJnaW4sIGRpc3RhbmNlIGFuZCBpbnRlcnZhbCBwcm9wZXJ0aWVzLFxuICAgICAgICAgKiAtIHRydWUgb3IgZmFsc2UgdG8gZW5hYmxlIG9yIGRpc2FibGUgYXV0b1Njcm9sbCBvclxuICAgICAgICAgPSAoSW50ZXJhY3RhYmxlKSB0aGlzIEludGVyYWN0YWJsZVxuICAgICAgICBcXCovXG4gICAgICAgIGF1dG9TY3JvbGw6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICBpZiAoaXNPYmplY3Qob3B0aW9ucykpIHtcbiAgICAgICAgICAgICAgICBvcHRpb25zID0gZXh0ZW5kKHsgYWN0aW9uczogWydkcmFnJywgJ3Jlc2l6ZSddfSwgb3B0aW9ucyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChpc0Jvb2wob3B0aW9ucykpIHtcbiAgICAgICAgICAgICAgICBvcHRpb25zID0geyBhY3Rpb25zOiBbJ2RyYWcnLCAncmVzaXplJ10sIGVuYWJsZWQ6IG9wdGlvbnMgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2V0T3B0aW9ucygnYXV0b1Njcm9sbCcsIG9wdGlvbnMpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qXFxcbiAgICAgICAgICogSW50ZXJhY3RhYmxlLnNuYXBcbiAgICAgICAgIFsgbWV0aG9kIF1cbiAgICAgICAgICoqXG4gICAgICAgICAqIERlcHJlY2F0ZWQuIEFkZCBhIGBzbmFwYCBwcm9wZXJ0eSB0byB0aGUgb3B0aW9ucyBvYmplY3QgcGFzc2VkXG4gICAgICAgICAqIHRvIEBJbnRlcmFjdGFibGUuZHJhZ2dhYmxlIG9yIEBJbnRlcmFjdGFibGUucmVzaXphYmxlIGluc3RlYWQuXG4gICAgICAgICAqXG4gICAgICAgICAqIFJldHVybnMgb3Igc2V0cyBpZiBhbmQgaG93IGFjdGlvbiBjb29yZGluYXRlcyBhcmUgc25hcHBlZC4gQnlcbiAgICAgICAgICogZGVmYXVsdCwgc25hcHBpbmcgaXMgcmVsYXRpdmUgdG8gdGhlIHBvaW50ZXIgY29vcmRpbmF0ZXMuIFlvdSBjYW5cbiAgICAgICAgICogY2hhbmdlIHRoaXMgYnkgc2V0dGluZyB0aGVcbiAgICAgICAgICogW2BlbGVtZW50T3JpZ2luYF0oaHR0cHM6Ly9naXRodWIuY29tL3RheWUvaW50ZXJhY3QuanMvcHVsbC83MikuXG4gICAgICAgICAqKlxuICAgICAgICAgPSAoYm9vbGVhbiB8IG9iamVjdCkgYGZhbHNlYCBpZiBzbmFwIGlzIGRpc2FibGVkOyBvYmplY3Qgd2l0aCBzbmFwIHByb3BlcnRpZXMgaWYgc25hcCBpcyBlbmFibGVkXG4gICAgICAgICAqKlxuICAgICAgICAgKiBvclxuICAgICAgICAgKipcbiAgICAgICAgIC0gb3B0aW9ucyAob2JqZWN0IHwgYm9vbGVhbiB8IG51bGwpICNvcHRpb25hbFxuICAgICAgICAgPSAoSW50ZXJhY3RhYmxlKSB0aGlzIEludGVyYWN0YWJsZVxuICAgICAgICAgPiBVc2FnZVxuICAgICAgICAgfCBpbnRlcmFjdChkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjdGhpbmcnKSkuc25hcCh7XG4gICAgICAgICB8ICAgICB0YXJnZXRzOiBbXG4gICAgICAgICB8ICAgICAgICAgLy8gc25hcCB0byB0aGlzIHNwZWNpZmljIHBvaW50XG4gICAgICAgICB8ICAgICAgICAge1xuICAgICAgICAgfCAgICAgICAgICAgICB4OiAxMDAsXG4gICAgICAgICB8ICAgICAgICAgICAgIHk6IDEwMCxcbiAgICAgICAgIHwgICAgICAgICAgICAgcmFuZ2U6IDI1XG4gICAgICAgICB8ICAgICAgICAgfSxcbiAgICAgICAgIHwgICAgICAgICAvLyBnaXZlIHRoaXMgZnVuY3Rpb24gdGhlIHggYW5kIHkgcGFnZSBjb29yZHMgYW5kIHNuYXAgdG8gdGhlIG9iamVjdCByZXR1cm5lZFxuICAgICAgICAgfCAgICAgICAgIGZ1bmN0aW9uICh4LCB5KSB7XG4gICAgICAgICB8ICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICB8ICAgICAgICAgICAgICAgICB4OiB4LFxuICAgICAgICAgfCAgICAgICAgICAgICAgICAgeTogKDc1ICsgNTAgKiBNYXRoLnNpbih4ICogMC4wNCkpLFxuICAgICAgICAgfCAgICAgICAgICAgICAgICAgcmFuZ2U6IDQwXG4gICAgICAgICB8ICAgICAgICAgICAgIH07XG4gICAgICAgICB8ICAgICAgICAgfSxcbiAgICAgICAgIHwgICAgICAgICAvLyBjcmVhdGUgYSBmdW5jdGlvbiB0aGF0IHNuYXBzIHRvIGEgZ3JpZFxuICAgICAgICAgfCAgICAgICAgIGludGVyYWN0LmNyZWF0ZVNuYXBHcmlkKHtcbiAgICAgICAgIHwgICAgICAgICAgICAgeDogNTAsXG4gICAgICAgICB8ICAgICAgICAgICAgIHk6IDUwLFxuICAgICAgICAgfCAgICAgICAgICAgICByYW5nZTogMTAsICAgICAgICAgICAgICAvLyBvcHRpb25hbFxuICAgICAgICAgfCAgICAgICAgICAgICBvZmZzZXQ6IHsgeDogNSwgeTogMTAgfSAvLyBvcHRpb25hbFxuICAgICAgICAgfCAgICAgICAgIH0pXG4gICAgICAgICB8ICAgICBdLFxuICAgICAgICAgfCAgICAgLy8gZG8gbm90IHNuYXAgZHVyaW5nIG5vcm1hbCBtb3ZlbWVudC5cbiAgICAgICAgIHwgICAgIC8vIEluc3RlYWQsIHRyaWdnZXIgb25seSBvbmUgc25hcHBlZCBtb3ZlIGV2ZW50XG4gICAgICAgICB8ICAgICAvLyBpbW1lZGlhdGVseSBiZWZvcmUgdGhlIGVuZCBldmVudC5cbiAgICAgICAgIHwgICAgIGVuZE9ubHk6IHRydWUsXG4gICAgICAgICB8XG4gICAgICAgICB8ICAgICByZWxhdGl2ZVBvaW50czogW1xuICAgICAgICAgfCAgICAgICAgIHsgeDogMCwgeTogMCB9LCAgLy8gc25hcCByZWxhdGl2ZSB0byB0aGUgdG9wIGxlZnQgb2YgdGhlIGVsZW1lbnRcbiAgICAgICAgIHwgICAgICAgICB7IHg6IDEsIHk6IDEgfSwgIC8vIGFuZCBhbHNvIHRvIHRoZSBib3R0b20gcmlnaHRcbiAgICAgICAgIHwgICAgIF0sICBcbiAgICAgICAgIHxcbiAgICAgICAgIHwgICAgIC8vIG9mZnNldCB0aGUgc25hcCB0YXJnZXQgY29vcmRpbmF0ZXNcbiAgICAgICAgIHwgICAgIC8vIGNhbiBiZSBhbiBvYmplY3Qgd2l0aCB4L3kgb3IgJ3N0YXJ0Q29vcmRzJ1xuICAgICAgICAgfCAgICAgb2Zmc2V0OiB7IHg6IDUwLCB5OiA1MCB9XG4gICAgICAgICB8ICAgfVxuICAgICAgICAgfCB9KTtcbiAgICAgICAgXFwqL1xuICAgICAgICBzbmFwOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgdmFyIHJldCA9IHRoaXMuc2V0T3B0aW9ucygnc25hcCcsIG9wdGlvbnMpO1xuXG4gICAgICAgICAgICBpZiAocmV0ID09PSB0aGlzKSB7IHJldHVybiB0aGlzOyB9XG5cbiAgICAgICAgICAgIHJldHVybiByZXQuZHJhZztcbiAgICAgICAgfSxcblxuICAgICAgICBzZXRPcHRpb25zOiBmdW5jdGlvbiAob3B0aW9uLCBvcHRpb25zKSB7XG4gICAgICAgICAgICB2YXIgYWN0aW9ucyA9IG9wdGlvbnMgJiYgaXNBcnJheShvcHRpb25zLmFjdGlvbnMpXG4gICAgICAgICAgICAgICAgICAgID8gb3B0aW9ucy5hY3Rpb25zXG4gICAgICAgICAgICAgICAgICAgIDogWydkcmFnJ107XG5cbiAgICAgICAgICAgIHZhciBpO1xuXG4gICAgICAgICAgICBpZiAoaXNPYmplY3Qob3B0aW9ucykgfHwgaXNCb29sKG9wdGlvbnMpKSB7XG4gICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGFjdGlvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGFjdGlvbiA9IC9yZXNpemUvLnRlc3QoYWN0aW9uc1tpXSk/ICdyZXNpemUnIDogYWN0aW9uc1tpXTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoIWlzT2JqZWN0KHRoaXMub3B0aW9uc1thY3Rpb25dKSkgeyBjb250aW51ZTsgfVxuXG4gICAgICAgICAgICAgICAgICAgIHZhciB0aGlzT3B0aW9uID0gdGhpcy5vcHRpb25zW2FjdGlvbl1bb3B0aW9uXTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoaXNPYmplY3Qob3B0aW9ucykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGV4dGVuZCh0aGlzT3B0aW9uLCBvcHRpb25zKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXNPcHRpb24uZW5hYmxlZCA9IG9wdGlvbnMuZW5hYmxlZCA9PT0gZmFsc2U/IGZhbHNlOiB0cnVlO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAob3B0aW9uID09PSAnc25hcCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpc09wdGlvbi5tb2RlID09PSAnZ3JpZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpc09wdGlvbi50YXJnZXRzID0gW1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXJhY3QuY3JlYXRlU25hcEdyaWQoZXh0ZW5kKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvZmZzZXQ6IHRoaXNPcHRpb24uZ3JpZE9mZnNldCB8fCB7IHg6IDAsIHk6IDAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSwgdGhpc09wdGlvbi5ncmlkIHx8IHt9KSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAodGhpc09wdGlvbi5tb2RlID09PSAnYW5jaG9yJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzT3B0aW9uLnRhcmdldHMgPSB0aGlzT3B0aW9uLmFuY2hvcnM7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKHRoaXNPcHRpb24ubW9kZSA9PT0gJ3BhdGgnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXNPcHRpb24udGFyZ2V0cyA9IHRoaXNPcHRpb24ucGF0aHM7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCdlbGVtZW50T3JpZ2luJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXNPcHRpb24ucmVsYXRpdmVQb2ludHMgPSBbb3B0aW9ucy5lbGVtZW50T3JpZ2luXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAoaXNCb29sKG9wdGlvbnMpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzT3B0aW9uLmVuYWJsZWQgPSBvcHRpb25zO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciByZXQgPSB7fSxcbiAgICAgICAgICAgICAgICBhbGxBY3Rpb25zID0gWydkcmFnJywgJ3Jlc2l6ZScsICdnZXN0dXJlJ107XG5cbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBhbGxBY3Rpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKG9wdGlvbiBpbiBkZWZhdWx0T3B0aW9uc1thbGxBY3Rpb25zW2ldXSkge1xuICAgICAgICAgICAgICAgICAgICByZXRbYWxsQWN0aW9uc1tpXV0gPSB0aGlzLm9wdGlvbnNbYWxsQWN0aW9uc1tpXV1bb3B0aW9uXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiByZXQ7XG4gICAgICAgIH0sXG5cblxuICAgICAgICAvKlxcXG4gICAgICAgICAqIEludGVyYWN0YWJsZS5pbmVydGlhXG4gICAgICAgICBbIG1ldGhvZCBdXG4gICAgICAgICAqKlxuICAgICAgICAgKiBEZXByZWNhdGVkLiBBZGQgYW4gYGluZXJ0aWFgIHByb3BlcnR5IHRvIHRoZSBvcHRpb25zIG9iamVjdCBwYXNzZWRcbiAgICAgICAgICogdG8gQEludGVyYWN0YWJsZS5kcmFnZ2FibGUgb3IgQEludGVyYWN0YWJsZS5yZXNpemFibGUgaW5zdGVhZC5cbiAgICAgICAgICpcbiAgICAgICAgICogUmV0dXJucyBvciBzZXRzIGlmIGFuZCBob3cgZXZlbnRzIGNvbnRpbnVlIHRvIHJ1biBhZnRlciB0aGUgcG9pbnRlciBpcyByZWxlYXNlZFxuICAgICAgICAgKipcbiAgICAgICAgID0gKGJvb2xlYW4gfCBvYmplY3QpIGBmYWxzZWAgaWYgaW5lcnRpYSBpcyBkaXNhYmxlZDsgYG9iamVjdGAgd2l0aCBpbmVydGlhIHByb3BlcnRpZXMgaWYgaW5lcnRpYSBpcyBlbmFibGVkXG4gICAgICAgICAqKlxuICAgICAgICAgKiBvclxuICAgICAgICAgKipcbiAgICAgICAgIC0gb3B0aW9ucyAob2JqZWN0IHwgYm9vbGVhbiB8IG51bGwpICNvcHRpb25hbFxuICAgICAgICAgPSAoSW50ZXJhY3RhYmxlKSB0aGlzIEludGVyYWN0YWJsZVxuICAgICAgICAgPiBVc2FnZVxuICAgICAgICAgfCAvLyBlbmFibGUgYW5kIHVzZSBkZWZhdWx0IHNldHRpbmdzXG4gICAgICAgICB8IGludGVyYWN0KGVsZW1lbnQpLmluZXJ0aWEodHJ1ZSk7XG4gICAgICAgICB8XG4gICAgICAgICB8IC8vIGVuYWJsZSBhbmQgdXNlIGN1c3RvbSBzZXR0aW5nc1xuICAgICAgICAgfCBpbnRlcmFjdChlbGVtZW50KS5pbmVydGlhKHtcbiAgICAgICAgIHwgICAgIC8vIHZhbHVlIGdyZWF0ZXIgdGhhbiAwXG4gICAgICAgICB8ICAgICAvLyBoaWdoIHZhbHVlcyBzbG93IHRoZSBvYmplY3QgZG93biBtb3JlIHF1aWNrbHlcbiAgICAgICAgIHwgICAgIHJlc2lzdGFuY2UgICAgIDogMTYsXG4gICAgICAgICB8XG4gICAgICAgICB8ICAgICAvLyB0aGUgbWluaW11bSBsYXVuY2ggc3BlZWQgKHBpeGVscyBwZXIgc2Vjb25kKSB0aGF0IHJlc3VsdHMgaW4gaW5lcnRpYSBzdGFydFxuICAgICAgICAgfCAgICAgbWluU3BlZWQgICAgICAgOiAyMDAsXG4gICAgICAgICB8XG4gICAgICAgICB8ICAgICAvLyBpbmVydGlhIHdpbGwgc3RvcCB3aGVuIHRoZSBvYmplY3Qgc2xvd3MgZG93biB0byB0aGlzIHNwZWVkXG4gICAgICAgICB8ICAgICBlbmRTcGVlZCAgICAgICA6IDIwLFxuICAgICAgICAgfFxuICAgICAgICAgfCAgICAgLy8gYm9vbGVhbjsgc2hvdWxkIGFjdGlvbnMgYmUgcmVzdW1lZCB3aGVuIHRoZSBwb2ludGVyIGdvZXMgZG93biBkdXJpbmcgaW5lcnRpYVxuICAgICAgICAgfCAgICAgYWxsb3dSZXN1bWUgICAgOiB0cnVlLFxuICAgICAgICAgfFxuICAgICAgICAgfCAgICAgLy8gYm9vbGVhbjsgc2hvdWxkIHRoZSBqdW1wIHdoZW4gcmVzdW1pbmcgZnJvbSBpbmVydGlhIGJlIGlnbm9yZWQgaW4gZXZlbnQuZHgvZHlcbiAgICAgICAgIHwgICAgIHplcm9SZXN1bWVEZWx0YTogZmFsc2UsXG4gICAgICAgICB8XG4gICAgICAgICB8ICAgICAvLyBpZiBzbmFwL3Jlc3RyaWN0IGFyZSBzZXQgdG8gYmUgZW5kT25seSBhbmQgaW5lcnRpYSBpcyBlbmFibGVkLCByZWxlYXNpbmdcbiAgICAgICAgIHwgICAgIC8vIHRoZSBwb2ludGVyIHdpdGhvdXQgdHJpZ2dlcmluZyBpbmVydGlhIHdpbGwgYW5pbWF0ZSBmcm9tIHRoZSByZWxlYXNlXG4gICAgICAgICB8ICAgICAvLyBwb2ludCB0byB0aGUgc25hcGVkL3Jlc3RyaWN0ZWQgcG9pbnQgaW4gdGhlIGdpdmVuIGFtb3VudCBvZiB0aW1lIChtcylcbiAgICAgICAgIHwgICAgIHNtb290aEVuZER1cmF0aW9uOiAzMDAsXG4gICAgICAgICB8XG4gICAgICAgICB8ICAgICAvLyBhbiBhcnJheSBvZiBhY3Rpb24gdHlwZXMgdGhhdCBjYW4gaGF2ZSBpbmVydGlhIChubyBnZXN0dXJlKVxuICAgICAgICAgfCAgICAgYWN0aW9ucyAgICAgICAgOiBbJ2RyYWcnLCAncmVzaXplJ11cbiAgICAgICAgIHwgfSk7XG4gICAgICAgICB8XG4gICAgICAgICB8IC8vIHJlc2V0IGN1c3RvbSBzZXR0aW5ncyBhbmQgdXNlIGFsbCBkZWZhdWx0c1xuICAgICAgICAgfCBpbnRlcmFjdChlbGVtZW50KS5pbmVydGlhKG51bGwpO1xuICAgICAgICBcXCovXG4gICAgICAgIGluZXJ0aWE6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICB2YXIgcmV0ID0gdGhpcy5zZXRPcHRpb25zKCdpbmVydGlhJywgb3B0aW9ucyk7XG5cbiAgICAgICAgICAgIGlmIChyZXQgPT09IHRoaXMpIHsgcmV0dXJuIHRoaXM7IH1cblxuICAgICAgICAgICAgcmV0dXJuIHJldC5kcmFnO1xuICAgICAgICB9LFxuXG4gICAgICAgIGdldEFjdGlvbjogZnVuY3Rpb24gKHBvaW50ZXIsIGV2ZW50LCBpbnRlcmFjdGlvbiwgZWxlbWVudCkge1xuICAgICAgICAgICAgdmFyIGFjdGlvbiA9IHRoaXMuZGVmYXVsdEFjdGlvbkNoZWNrZXIocG9pbnRlciwgaW50ZXJhY3Rpb24sIGVsZW1lbnQpO1xuXG4gICAgICAgICAgICBpZiAodGhpcy5vcHRpb25zLmFjdGlvbkNoZWNrZXIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5vcHRpb25zLmFjdGlvbkNoZWNrZXIocG9pbnRlciwgZXZlbnQsIGFjdGlvbiwgdGhpcywgZWxlbWVudCwgaW50ZXJhY3Rpb24pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gYWN0aW9uO1xuICAgICAgICB9LFxuXG4gICAgICAgIGRlZmF1bHRBY3Rpb25DaGVja2VyOiBkZWZhdWx0QWN0aW9uQ2hlY2tlcixcblxuICAgICAgICAvKlxcXG4gICAgICAgICAqIEludGVyYWN0YWJsZS5hY3Rpb25DaGVja2VyXG4gICAgICAgICBbIG1ldGhvZCBdXG4gICAgICAgICAqXG4gICAgICAgICAqIEdldHMgb3Igc2V0cyB0aGUgZnVuY3Rpb24gdXNlZCB0byBjaGVjayBhY3Rpb24gdG8gYmUgcGVyZm9ybWVkIG9uXG4gICAgICAgICAqIHBvaW50ZXJEb3duXG4gICAgICAgICAqXG4gICAgICAgICAtIGNoZWNrZXIgKGZ1bmN0aW9uIHwgbnVsbCkgI29wdGlvbmFsIEEgZnVuY3Rpb24gd2hpY2ggdGFrZXMgYSBwb2ludGVyIGV2ZW50LCBkZWZhdWx0QWN0aW9uIHN0cmluZywgaW50ZXJhY3RhYmxlLCBlbGVtZW50IGFuZCBpbnRlcmFjdGlvbiBhcyBwYXJhbWV0ZXJzIGFuZCByZXR1cm5zIGFuIG9iamVjdCB3aXRoIG5hbWUgcHJvcGVydHkgJ2RyYWcnICdyZXNpemUnIG9yICdnZXN0dXJlJyBhbmQgb3B0aW9uYWxseSBhbiBgZWRnZXNgIG9iamVjdCB3aXRoIGJvb2xlYW4gJ3RvcCcsICdsZWZ0JywgJ2JvdHRvbScgYW5kIHJpZ2h0IHByb3BzLlxuICAgICAgICAgPSAoRnVuY3Rpb24gfCBJbnRlcmFjdGFibGUpIFRoZSBjaGVja2VyIGZ1bmN0aW9uIG9yIHRoaXMgSW50ZXJhY3RhYmxlXG4gICAgICAgICAqXG4gICAgICAgICB8IGludGVyYWN0KCcucmVzaXplLWRyYWcnKVxuICAgICAgICAgfCAgIC5yZXNpemFibGUodHJ1ZSlcbiAgICAgICAgIHwgICAuZHJhZ2dhYmxlKHRydWUpXG4gICAgICAgICB8ICAgLmFjdGlvbkNoZWNrZXIoZnVuY3Rpb24gKHBvaW50ZXIsIGV2ZW50LCBhY3Rpb24sIGludGVyYWN0YWJsZSwgZWxlbWVudCwgaW50ZXJhY3Rpb24pIHtcbiAgICAgICAgIHxcbiAgICAgICAgIHwgICBpZiAoaW50ZXJhY3QubWF0Y2hlc1NlbGVjdG9yKGV2ZW50LnRhcmdldCwgJy5kcmFnLWhhbmRsZScpIHtcbiAgICAgICAgIHwgICAgIC8vIGZvcmNlIGRyYWcgd2l0aCBoYW5kbGUgdGFyZ2V0XG4gICAgICAgICB8ICAgICBhY3Rpb24ubmFtZSA9IGRyYWc7XG4gICAgICAgICB8ICAgfVxuICAgICAgICAgfCAgIGVsc2Uge1xuICAgICAgICAgfCAgICAgLy8gcmVzaXplIGZyb20gdGhlIHRvcCBhbmQgcmlnaHQgZWRnZXNcbiAgICAgICAgIHwgICAgIGFjdGlvbi5uYW1lICA9ICdyZXNpemUnO1xuICAgICAgICAgfCAgICAgYWN0aW9uLmVkZ2VzID0geyB0b3A6IHRydWUsIHJpZ2h0OiB0cnVlIH07XG4gICAgICAgICB8ICAgfVxuICAgICAgICAgfFxuICAgICAgICAgfCAgIHJldHVybiBhY3Rpb247XG4gICAgICAgICB8IH0pO1xuICAgICAgICBcXCovXG4gICAgICAgIGFjdGlvbkNoZWNrZXI6IGZ1bmN0aW9uIChjaGVja2VyKSB7XG4gICAgICAgICAgICBpZiAoaXNGdW5jdGlvbihjaGVja2VyKSkge1xuICAgICAgICAgICAgICAgIHRoaXMub3B0aW9ucy5hY3Rpb25DaGVja2VyID0gY2hlY2tlcjtcblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoY2hlY2tlciA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGRlbGV0ZSB0aGlzLm9wdGlvbnMuYWN0aW9uQ2hlY2tlcjtcblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5vcHRpb25zLmFjdGlvbkNoZWNrZXI7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLypcXFxuICAgICAgICAgKiBJbnRlcmFjdGFibGUuZ2V0UmVjdFxuICAgICAgICAgWyBtZXRob2QgXVxuICAgICAgICAgKlxuICAgICAgICAgKiBUaGUgZGVmYXVsdCBmdW5jdGlvbiB0byBnZXQgYW4gSW50ZXJhY3RhYmxlcyBib3VuZGluZyByZWN0LiBDYW4gYmVcbiAgICAgICAgICogb3ZlcnJpZGRlbiB1c2luZyBASW50ZXJhY3RhYmxlLnJlY3RDaGVja2VyLlxuICAgICAgICAgKlxuICAgICAgICAgLSBlbGVtZW50IChFbGVtZW50KSAjb3B0aW9uYWwgVGhlIGVsZW1lbnQgdG8gbWVhc3VyZS5cbiAgICAgICAgID0gKG9iamVjdCkgVGhlIG9iamVjdCdzIGJvdW5kaW5nIHJlY3RhbmdsZS5cbiAgICAgICAgIG8ge1xuICAgICAgICAgbyAgICAgdG9wICAgOiAwLFxuICAgICAgICAgbyAgICAgbGVmdCAgOiAwLFxuICAgICAgICAgbyAgICAgYm90dG9tOiAwLFxuICAgICAgICAgbyAgICAgcmlnaHQgOiAwLFxuICAgICAgICAgbyAgICAgd2lkdGggOiAwLFxuICAgICAgICAgbyAgICAgaGVpZ2h0OiAwXG4gICAgICAgICBvIH1cbiAgICAgICAgXFwqL1xuICAgICAgICBnZXRSZWN0OiBmdW5jdGlvbiByZWN0Q2hlY2sgKGVsZW1lbnQpIHtcbiAgICAgICAgICAgIGVsZW1lbnQgPSBlbGVtZW50IHx8IHRoaXMuX2VsZW1lbnQ7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLnNlbGVjdG9yICYmICEoaXNFbGVtZW50KGVsZW1lbnQpKSkge1xuICAgICAgICAgICAgICAgIGVsZW1lbnQgPSB0aGlzLl9jb250ZXh0LnF1ZXJ5U2VsZWN0b3IodGhpcy5zZWxlY3Rvcik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBnZXRFbGVtZW50UmVjdChlbGVtZW50KTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKlxcXG4gICAgICAgICAqIEludGVyYWN0YWJsZS5yZWN0Q2hlY2tlclxuICAgICAgICAgWyBtZXRob2QgXVxuICAgICAgICAgKlxuICAgICAgICAgKiBSZXR1cm5zIG9yIHNldHMgdGhlIGZ1bmN0aW9uIHVzZWQgdG8gY2FsY3VsYXRlIHRoZSBpbnRlcmFjdGFibGUnc1xuICAgICAgICAgKiBlbGVtZW50J3MgcmVjdGFuZ2xlXG4gICAgICAgICAqXG4gICAgICAgICAtIGNoZWNrZXIgKGZ1bmN0aW9uKSAjb3B0aW9uYWwgQSBmdW5jdGlvbiB3aGljaCByZXR1cm5zIHRoaXMgSW50ZXJhY3RhYmxlJ3MgYm91bmRpbmcgcmVjdGFuZ2xlLiBTZWUgQEludGVyYWN0YWJsZS5nZXRSZWN0XG4gICAgICAgICA9IChmdW5jdGlvbiB8IG9iamVjdCkgVGhlIGNoZWNrZXIgZnVuY3Rpb24gb3IgdGhpcyBJbnRlcmFjdGFibGVcbiAgICAgICAgXFwqL1xuICAgICAgICByZWN0Q2hlY2tlcjogZnVuY3Rpb24gKGNoZWNrZXIpIHtcbiAgICAgICAgICAgIGlmIChpc0Z1bmN0aW9uKGNoZWNrZXIpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5nZXRSZWN0ID0gY2hlY2tlcjtcblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoY2hlY2tlciA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGRlbGV0ZSB0aGlzLm9wdGlvbnMuZ2V0UmVjdDtcblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5nZXRSZWN0O1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qXFxcbiAgICAgICAgICogSW50ZXJhY3RhYmxlLnN0eWxlQ3Vyc29yXG4gICAgICAgICBbIG1ldGhvZCBdXG4gICAgICAgICAqXG4gICAgICAgICAqIFJldHVybnMgb3Igc2V0cyB3aGV0aGVyIHRoZSBhY3Rpb24gdGhhdCB3b3VsZCBiZSBwZXJmb3JtZWQgd2hlbiB0aGVcbiAgICAgICAgICogbW91c2Ugb24gdGhlIGVsZW1lbnQgYXJlIGNoZWNrZWQgb24gYG1vdXNlbW92ZWAgc28gdGhhdCB0aGUgY3Vyc29yXG4gICAgICAgICAqIG1heSBiZSBzdHlsZWQgYXBwcm9wcmlhdGVseVxuICAgICAgICAgKlxuICAgICAgICAgLSBuZXdWYWx1ZSAoYm9vbGVhbikgI29wdGlvbmFsXG4gICAgICAgICA9IChib29sZWFuIHwgSW50ZXJhY3RhYmxlKSBUaGUgY3VycmVudCBzZXR0aW5nIG9yIHRoaXMgSW50ZXJhY3RhYmxlXG4gICAgICAgIFxcKi9cbiAgICAgICAgc3R5bGVDdXJzb3I6IGZ1bmN0aW9uIChuZXdWYWx1ZSkge1xuICAgICAgICAgICAgaWYgKGlzQm9vbChuZXdWYWx1ZSkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMuc3R5bGVDdXJzb3IgPSBuZXdWYWx1ZTtcblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAobmV3VmFsdWUgPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBkZWxldGUgdGhpcy5vcHRpb25zLnN0eWxlQ3Vyc29yO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzLm9wdGlvbnMuc3R5bGVDdXJzb3I7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLypcXFxuICAgICAgICAgKiBJbnRlcmFjdGFibGUucHJldmVudERlZmF1bHRcbiAgICAgICAgIFsgbWV0aG9kIF1cbiAgICAgICAgICpcbiAgICAgICAgICogUmV0dXJucyBvciBzZXRzIHdoZXRoZXIgdG8gcHJldmVudCB0aGUgYnJvd3NlcidzIGRlZmF1bHQgYmVoYXZpb3VyXG4gICAgICAgICAqIGluIHJlc3BvbnNlIHRvIHBvaW50ZXIgZXZlbnRzLiBDYW4gYmUgc2V0IHRvOlxuICAgICAgICAgKiAgLSBgJ2Fsd2F5cydgIHRvIGFsd2F5cyBwcmV2ZW50XG4gICAgICAgICAqICAtIGAnbmV2ZXInYCB0byBuZXZlciBwcmV2ZW50XG4gICAgICAgICAqICAtIGAnYXV0bydgIHRvIGxldCBpbnRlcmFjdC5qcyB0cnkgdG8gZGV0ZXJtaW5lIHdoYXQgd291bGQgYmUgYmVzdFxuICAgICAgICAgKlxuICAgICAgICAgLSBuZXdWYWx1ZSAoc3RyaW5nKSAjb3B0aW9uYWwgYHRydWVgLCBgZmFsc2VgIG9yIGAnYXV0bydgXG4gICAgICAgICA9IChzdHJpbmcgfCBJbnRlcmFjdGFibGUpIFRoZSBjdXJyZW50IHNldHRpbmcgb3IgdGhpcyBJbnRlcmFjdGFibGVcbiAgICAgICAgXFwqL1xuICAgICAgICBwcmV2ZW50RGVmYXVsdDogZnVuY3Rpb24gKG5ld1ZhbHVlKSB7XG4gICAgICAgICAgICBpZiAoL14oYWx3YXlzfG5ldmVyfGF1dG8pJC8udGVzdChuZXdWYWx1ZSkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMucHJldmVudERlZmF1bHQgPSBuZXdWYWx1ZTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGlzQm9vbChuZXdWYWx1ZSkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMucHJldmVudERlZmF1bHQgPSBuZXdWYWx1ZT8gJ2Fsd2F5cycgOiAnbmV2ZXInO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5vcHRpb25zLnByZXZlbnREZWZhdWx0O1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qXFxcbiAgICAgICAgICogSW50ZXJhY3RhYmxlLm9yaWdpblxuICAgICAgICAgWyBtZXRob2QgXVxuICAgICAgICAgKlxuICAgICAgICAgKiBHZXRzIG9yIHNldHMgdGhlIG9yaWdpbiBvZiB0aGUgSW50ZXJhY3RhYmxlJ3MgZWxlbWVudC4gIFRoZSB4IGFuZCB5XG4gICAgICAgICAqIG9mIHRoZSBvcmlnaW4gd2lsbCBiZSBzdWJ0cmFjdGVkIGZyb20gYWN0aW9uIGV2ZW50IGNvb3JkaW5hdGVzLlxuICAgICAgICAgKlxuICAgICAgICAgLSBvcmlnaW4gKG9iamVjdCB8IHN0cmluZykgI29wdGlvbmFsIEFuIG9iamVjdCBlZy4geyB4OiAwLCB5OiAwIH0gb3Igc3RyaW5nICdwYXJlbnQnLCAnc2VsZicgb3IgYW55IENTUyBzZWxlY3RvclxuICAgICAgICAgKiBPUlxuICAgICAgICAgLSBvcmlnaW4gKEVsZW1lbnQpICNvcHRpb25hbCBBbiBIVE1MIG9yIFNWRyBFbGVtZW50IHdob3NlIHJlY3Qgd2lsbCBiZSB1c2VkXG4gICAgICAgICAqKlxuICAgICAgICAgPSAob2JqZWN0KSBUaGUgY3VycmVudCBvcmlnaW4gb3IgdGhpcyBJbnRlcmFjdGFibGVcbiAgICAgICAgXFwqL1xuICAgICAgICBvcmlnaW46IGZ1bmN0aW9uIChuZXdWYWx1ZSkge1xuICAgICAgICAgICAgaWYgKHRyeVNlbGVjdG9yKG5ld1ZhbHVlKSkge1xuICAgICAgICAgICAgICAgIHRoaXMub3B0aW9ucy5vcmlnaW4gPSBuZXdWYWx1ZTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGlzT2JqZWN0KG5ld1ZhbHVlKSkge1xuICAgICAgICAgICAgICAgIHRoaXMub3B0aW9ucy5vcmlnaW4gPSBuZXdWYWx1ZTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRoaXMub3B0aW9ucy5vcmlnaW47XG4gICAgICAgIH0sXG5cbiAgICAgICAgLypcXFxuICAgICAgICAgKiBJbnRlcmFjdGFibGUuZGVsdGFTb3VyY2VcbiAgICAgICAgIFsgbWV0aG9kIF1cbiAgICAgICAgICpcbiAgICAgICAgICogUmV0dXJucyBvciBzZXRzIHRoZSBtb3VzZSBjb29yZGluYXRlIHR5cGVzIHVzZWQgdG8gY2FsY3VsYXRlIHRoZVxuICAgICAgICAgKiBtb3ZlbWVudCBvZiB0aGUgcG9pbnRlci5cbiAgICAgICAgICpcbiAgICAgICAgIC0gbmV3VmFsdWUgKHN0cmluZykgI29wdGlvbmFsIFVzZSAnY2xpZW50JyBpZiB5b3Ugd2lsbCBiZSBzY3JvbGxpbmcgd2hpbGUgaW50ZXJhY3Rpbmc7IFVzZSAncGFnZScgaWYgeW91IHdhbnQgYXV0b1Njcm9sbCB0byB3b3JrXG4gICAgICAgICA9IChzdHJpbmcgfCBvYmplY3QpIFRoZSBjdXJyZW50IGRlbHRhU291cmNlIG9yIHRoaXMgSW50ZXJhY3RhYmxlXG4gICAgICAgIFxcKi9cbiAgICAgICAgZGVsdGFTb3VyY2U6IGZ1bmN0aW9uIChuZXdWYWx1ZSkge1xuICAgICAgICAgICAgaWYgKG5ld1ZhbHVlID09PSAncGFnZScgfHwgbmV3VmFsdWUgPT09ICdjbGllbnQnKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLmRlbHRhU291cmNlID0gbmV3VmFsdWU7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRoaXMub3B0aW9ucy5kZWx0YVNvdXJjZTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKlxcXG4gICAgICAgICAqIEludGVyYWN0YWJsZS5yZXN0cmljdFxuICAgICAgICAgWyBtZXRob2QgXVxuICAgICAgICAgKipcbiAgICAgICAgICogRGVwcmVjYXRlZC4gQWRkIGEgYHJlc3RyaWN0YCBwcm9wZXJ0eSB0byB0aGUgb3B0aW9ucyBvYmplY3QgcGFzc2VkIHRvXG4gICAgICAgICAqIEBJbnRlcmFjdGFibGUuZHJhZ2dhYmxlLCBASW50ZXJhY3RhYmxlLnJlc2l6YWJsZSBvciBASW50ZXJhY3RhYmxlLmdlc3R1cmFibGUgaW5zdGVhZC5cbiAgICAgICAgICpcbiAgICAgICAgICogUmV0dXJucyBvciBzZXRzIHRoZSByZWN0YW5nbGVzIHdpdGhpbiB3aGljaCBhY3Rpb25zIG9uIHRoaXNcbiAgICAgICAgICogaW50ZXJhY3RhYmxlIChhZnRlciBzbmFwIGNhbGN1bGF0aW9ucykgYXJlIHJlc3RyaWN0ZWQuIEJ5IGRlZmF1bHQsXG4gICAgICAgICAqIHJlc3RyaWN0aW5nIGlzIHJlbGF0aXZlIHRvIHRoZSBwb2ludGVyIGNvb3JkaW5hdGVzLiBZb3UgY2FuIGNoYW5nZVxuICAgICAgICAgKiB0aGlzIGJ5IHNldHRpbmcgdGhlXG4gICAgICAgICAqIFtgZWxlbWVudFJlY3RgXShodHRwczovL2dpdGh1Yi5jb20vdGF5ZS9pbnRlcmFjdC5qcy9wdWxsLzcyKS5cbiAgICAgICAgICoqXG4gICAgICAgICAtIG9wdGlvbnMgKG9iamVjdCkgI29wdGlvbmFsIGFuIG9iamVjdCB3aXRoIGtleXMgZHJhZywgcmVzaXplLCBhbmQvb3IgZ2VzdHVyZSB3aG9zZSB2YWx1ZXMgYXJlIHJlY3RzLCBFbGVtZW50cywgQ1NTIHNlbGVjdG9ycywgb3IgJ3BhcmVudCcgb3IgJ3NlbGYnXG4gICAgICAgICA9IChvYmplY3QpIFRoZSBjdXJyZW50IHJlc3RyaWN0aW9ucyBvYmplY3Qgb3IgdGhpcyBJbnRlcmFjdGFibGVcbiAgICAgICAgICoqXG4gICAgICAgICB8IGludGVyYWN0KGVsZW1lbnQpLnJlc3RyaWN0KHtcbiAgICAgICAgIHwgICAgIC8vIHRoZSByZWN0IHdpbGwgYmUgYGludGVyYWN0LmdldEVsZW1lbnRSZWN0KGVsZW1lbnQucGFyZW50Tm9kZSlgXG4gICAgICAgICB8ICAgICBkcmFnOiBlbGVtZW50LnBhcmVudE5vZGUsXG4gICAgICAgICB8XG4gICAgICAgICB8ICAgICAvLyB4IGFuZCB5IGFyZSByZWxhdGl2ZSB0byB0aGUgdGhlIGludGVyYWN0YWJsZSdzIG9yaWdpblxuICAgICAgICAgfCAgICAgcmVzaXplOiB7IHg6IDEwMCwgeTogMTAwLCB3aWR0aDogMjAwLCBoZWlnaHQ6IDIwMCB9XG4gICAgICAgICB8IH0pXG4gICAgICAgICB8XG4gICAgICAgICB8IGludGVyYWN0KCcuZHJhZ2dhYmxlJykucmVzdHJpY3Qoe1xuICAgICAgICAgfCAgICAgLy8gdGhlIHJlY3Qgd2lsbCBiZSB0aGUgc2VsZWN0ZWQgZWxlbWVudCdzIHBhcmVudFxuICAgICAgICAgfCAgICAgZHJhZzogJ3BhcmVudCcsXG4gICAgICAgICB8XG4gICAgICAgICB8ICAgICAvLyBkbyBub3QgcmVzdHJpY3QgZHVyaW5nIG5vcm1hbCBtb3ZlbWVudC5cbiAgICAgICAgIHwgICAgIC8vIEluc3RlYWQsIHRyaWdnZXIgb25seSBvbmUgcmVzdHJpY3RlZCBtb3ZlIGV2ZW50XG4gICAgICAgICB8ICAgICAvLyBpbW1lZGlhdGVseSBiZWZvcmUgdGhlIGVuZCBldmVudC5cbiAgICAgICAgIHwgICAgIGVuZE9ubHk6IHRydWUsXG4gICAgICAgICB8XG4gICAgICAgICB8ICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vdGF5ZS9pbnRlcmFjdC5qcy9wdWxsLzcyI2lzc3VlLTQxODEzNDkzXG4gICAgICAgICB8ICAgICBlbGVtZW50UmVjdDogeyB0b3A6IDAsIGxlZnQ6IDAsIGJvdHRvbTogMSwgcmlnaHQ6IDEgfVxuICAgICAgICAgfCB9KTtcbiAgICAgICAgXFwqL1xuICAgICAgICByZXN0cmljdDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGlmICghaXNPYmplY3Qob3B0aW9ucykpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5zZXRPcHRpb25zKCdyZXN0cmljdCcsIG9wdGlvbnMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgYWN0aW9ucyA9IFsnZHJhZycsICdyZXNpemUnLCAnZ2VzdHVyZSddLFxuICAgICAgICAgICAgICAgIHJldDtcblxuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhY3Rpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgdmFyIGFjdGlvbiA9IGFjdGlvbnNbaV07XG5cbiAgICAgICAgICAgICAgICBpZiAoYWN0aW9uIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHBlckFjdGlvbiA9IGV4dGVuZCh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYWN0aW9uczogW2FjdGlvbl0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzdHJpY3Rpb246IG9wdGlvbnNbYWN0aW9uXVxuICAgICAgICAgICAgICAgICAgICAgICAgfSwgb3B0aW9ucyk7XG5cbiAgICAgICAgICAgICAgICAgICAgcmV0ID0gdGhpcy5zZXRPcHRpb25zKCdyZXN0cmljdCcsIHBlckFjdGlvbik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gcmV0O1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qXFxcbiAgICAgICAgICogSW50ZXJhY3RhYmxlLmNvbnRleHRcbiAgICAgICAgIFsgbWV0aG9kIF1cbiAgICAgICAgICpcbiAgICAgICAgICogR2V0cyB0aGUgc2VsZWN0b3IgY29udGV4dCBOb2RlIG9mIHRoZSBJbnRlcmFjdGFibGUuIFRoZSBkZWZhdWx0IGlzIGB3aW5kb3cuZG9jdW1lbnRgLlxuICAgICAgICAgKlxuICAgICAgICAgPSAoTm9kZSkgVGhlIGNvbnRleHQgTm9kZSBvZiB0aGlzIEludGVyYWN0YWJsZVxuICAgICAgICAgKipcbiAgICAgICAgXFwqL1xuICAgICAgICBjb250ZXh0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fY29udGV4dDtcbiAgICAgICAgfSxcblxuICAgICAgICBfY29udGV4dDogZG9jdW1lbnQsXG5cbiAgICAgICAgLypcXFxuICAgICAgICAgKiBJbnRlcmFjdGFibGUuaWdub3JlRnJvbVxuICAgICAgICAgWyBtZXRob2QgXVxuICAgICAgICAgKlxuICAgICAgICAgKiBJZiB0aGUgdGFyZ2V0IG9mIHRoZSBgbW91c2Vkb3duYCwgYHBvaW50ZXJkb3duYCBvciBgdG91Y2hzdGFydGBcbiAgICAgICAgICogZXZlbnQgb3IgYW55IG9mIGl0J3MgcGFyZW50cyBtYXRjaCB0aGUgZ2l2ZW4gQ1NTIHNlbGVjdG9yIG9yXG4gICAgICAgICAqIEVsZW1lbnQsIG5vIGRyYWcvcmVzaXplL2dlc3R1cmUgaXMgc3RhcnRlZC5cbiAgICAgICAgICpcbiAgICAgICAgIC0gbmV3VmFsdWUgKHN0cmluZyB8IEVsZW1lbnQgfCBudWxsKSAjb3B0aW9uYWwgYSBDU1Mgc2VsZWN0b3Igc3RyaW5nLCBhbiBFbGVtZW50IG9yIGBudWxsYCB0byBub3QgaWdub3JlIGFueSBlbGVtZW50c1xuICAgICAgICAgPSAoc3RyaW5nIHwgRWxlbWVudCB8IG9iamVjdCkgVGhlIGN1cnJlbnQgaWdub3JlRnJvbSB2YWx1ZSBvciB0aGlzIEludGVyYWN0YWJsZVxuICAgICAgICAgKipcbiAgICAgICAgIHwgaW50ZXJhY3QoZWxlbWVudCwgeyBpZ25vcmVGcm9tOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbm8tYWN0aW9uJykgfSk7XG4gICAgICAgICB8IC8vIG9yXG4gICAgICAgICB8IGludGVyYWN0KGVsZW1lbnQpLmlnbm9yZUZyb20oJ2lucHV0LCB0ZXh0YXJlYSwgYScpO1xuICAgICAgICBcXCovXG4gICAgICAgIGlnbm9yZUZyb206IGZ1bmN0aW9uIChuZXdWYWx1ZSkge1xuICAgICAgICAgICAgaWYgKHRyeVNlbGVjdG9yKG5ld1ZhbHVlKSkgeyAgICAgICAgICAgIC8vIENTUyBzZWxlY3RvciB0byBtYXRjaCBldmVudC50YXJnZXRcbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMuaWdub3JlRnJvbSA9IG5ld1ZhbHVlO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoaXNFbGVtZW50KG5ld1ZhbHVlKSkgeyAgICAgICAgICAgICAgLy8gc3BlY2lmaWMgZWxlbWVudFxuICAgICAgICAgICAgICAgIHRoaXMub3B0aW9ucy5pZ25vcmVGcm9tID0gbmV3VmFsdWU7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzLm9wdGlvbnMuaWdub3JlRnJvbTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKlxcXG4gICAgICAgICAqIEludGVyYWN0YWJsZS5hbGxvd0Zyb21cbiAgICAgICAgIFsgbWV0aG9kIF1cbiAgICAgICAgICpcbiAgICAgICAgICogQSBkcmFnL3Jlc2l6ZS9nZXN0dXJlIGlzIHN0YXJ0ZWQgb25seSBJZiB0aGUgdGFyZ2V0IG9mIHRoZVxuICAgICAgICAgKiBgbW91c2Vkb3duYCwgYHBvaW50ZXJkb3duYCBvciBgdG91Y2hzdGFydGAgZXZlbnQgb3IgYW55IG9mIGl0J3NcbiAgICAgICAgICogcGFyZW50cyBtYXRjaCB0aGUgZ2l2ZW4gQ1NTIHNlbGVjdG9yIG9yIEVsZW1lbnQuXG4gICAgICAgICAqXG4gICAgICAgICAtIG5ld1ZhbHVlIChzdHJpbmcgfCBFbGVtZW50IHwgbnVsbCkgI29wdGlvbmFsIGEgQ1NTIHNlbGVjdG9yIHN0cmluZywgYW4gRWxlbWVudCBvciBgbnVsbGAgdG8gYWxsb3cgZnJvbSBhbnkgZWxlbWVudFxuICAgICAgICAgPSAoc3RyaW5nIHwgRWxlbWVudCB8IG9iamVjdCkgVGhlIGN1cnJlbnQgYWxsb3dGcm9tIHZhbHVlIG9yIHRoaXMgSW50ZXJhY3RhYmxlXG4gICAgICAgICAqKlxuICAgICAgICAgfCBpbnRlcmFjdChlbGVtZW50LCB7IGFsbG93RnJvbTogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2RyYWctaGFuZGxlJykgfSk7XG4gICAgICAgICB8IC8vIG9yXG4gICAgICAgICB8IGludGVyYWN0KGVsZW1lbnQpLmFsbG93RnJvbSgnLmhhbmRsZScpO1xuICAgICAgICBcXCovXG4gICAgICAgIGFsbG93RnJvbTogZnVuY3Rpb24gKG5ld1ZhbHVlKSB7XG4gICAgICAgICAgICBpZiAodHJ5U2VsZWN0b3IobmV3VmFsdWUpKSB7ICAgICAgICAgICAgLy8gQ1NTIHNlbGVjdG9yIHRvIG1hdGNoIGV2ZW50LnRhcmdldFxuICAgICAgICAgICAgICAgIHRoaXMub3B0aW9ucy5hbGxvd0Zyb20gPSBuZXdWYWx1ZTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGlzRWxlbWVudChuZXdWYWx1ZSkpIHsgICAgICAgICAgICAgIC8vIHNwZWNpZmljIGVsZW1lbnRcbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMuYWxsb3dGcm9tID0gbmV3VmFsdWU7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzLm9wdGlvbnMuYWxsb3dGcm9tO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qXFxcbiAgICAgICAgICogSW50ZXJhY3RhYmxlLmVsZW1lbnRcbiAgICAgICAgIFsgbWV0aG9kIF1cbiAgICAgICAgICpcbiAgICAgICAgICogSWYgdGhpcyBpcyBub3QgYSBzZWxlY3RvciBJbnRlcmFjdGFibGUsIGl0IHJldHVybnMgdGhlIGVsZW1lbnQgdGhpc1xuICAgICAgICAgKiBpbnRlcmFjdGFibGUgcmVwcmVzZW50c1xuICAgICAgICAgKlxuICAgICAgICAgPSAoRWxlbWVudCkgSFRNTCAvIFNWRyBFbGVtZW50XG4gICAgICAgIFxcKi9cbiAgICAgICAgZWxlbWVudDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2VsZW1lbnQ7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLypcXFxuICAgICAgICAgKiBJbnRlcmFjdGFibGUuZmlyZVxuICAgICAgICAgWyBtZXRob2QgXVxuICAgICAgICAgKlxuICAgICAgICAgKiBDYWxscyBsaXN0ZW5lcnMgZm9yIHRoZSBnaXZlbiBJbnRlcmFjdEV2ZW50IHR5cGUgYm91bmQgZ2xvYmFsbHlcbiAgICAgICAgICogYW5kIGRpcmVjdGx5IHRvIHRoaXMgSW50ZXJhY3RhYmxlXG4gICAgICAgICAqXG4gICAgICAgICAtIGlFdmVudCAoSW50ZXJhY3RFdmVudCkgVGhlIEludGVyYWN0RXZlbnQgb2JqZWN0IHRvIGJlIGZpcmVkIG9uIHRoaXMgSW50ZXJhY3RhYmxlXG4gICAgICAgICA9IChJbnRlcmFjdGFibGUpIHRoaXMgSW50ZXJhY3RhYmxlXG4gICAgICAgIFxcKi9cbiAgICAgICAgZmlyZTogZnVuY3Rpb24gKGlFdmVudCkge1xuICAgICAgICAgICAgaWYgKCEoaUV2ZW50ICYmIGlFdmVudC50eXBlKSB8fCAhY29udGFpbnMoZXZlbnRUeXBlcywgaUV2ZW50LnR5cGUpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBsaXN0ZW5lcnMsXG4gICAgICAgICAgICAgICAgaSxcbiAgICAgICAgICAgICAgICBsZW4sXG4gICAgICAgICAgICAgICAgb25FdmVudCA9ICdvbicgKyBpRXZlbnQudHlwZSxcbiAgICAgICAgICAgICAgICBmdW5jTmFtZSA9ICcnO1xuXG4gICAgICAgICAgICAvLyBJbnRlcmFjdGFibGUjb24oKSBsaXN0ZW5lcnNcbiAgICAgICAgICAgIGlmIChpRXZlbnQudHlwZSBpbiB0aGlzLl9pRXZlbnRzKSB7XG4gICAgICAgICAgICAgICAgbGlzdGVuZXJzID0gdGhpcy5faUV2ZW50c1tpRXZlbnQudHlwZV07XG5cbiAgICAgICAgICAgICAgICBmb3IgKGkgPSAwLCBsZW4gPSBsaXN0ZW5lcnMubGVuZ3RoOyBpIDwgbGVuICYmICFpRXZlbnQuaW1tZWRpYXRlUHJvcGFnYXRpb25TdG9wcGVkOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgZnVuY05hbWUgPSBsaXN0ZW5lcnNbaV0ubmFtZTtcbiAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXJzW2ldKGlFdmVudCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBpbnRlcmFjdGFibGUub25ldmVudCBsaXN0ZW5lclxuICAgICAgICAgICAgaWYgKGlzRnVuY3Rpb24odGhpc1tvbkV2ZW50XSkpIHtcbiAgICAgICAgICAgICAgICBmdW5jTmFtZSA9IHRoaXNbb25FdmVudF0ubmFtZTtcbiAgICAgICAgICAgICAgICB0aGlzW29uRXZlbnRdKGlFdmVudCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGludGVyYWN0Lm9uKCkgbGlzdGVuZXJzXG4gICAgICAgICAgICBpZiAoaUV2ZW50LnR5cGUgaW4gZ2xvYmFsRXZlbnRzICYmIChsaXN0ZW5lcnMgPSBnbG9iYWxFdmVudHNbaUV2ZW50LnR5cGVdKSkgIHtcblxuICAgICAgICAgICAgICAgIGZvciAoaSA9IDAsIGxlbiA9IGxpc3RlbmVycy5sZW5ndGg7IGkgPCBsZW4gJiYgIWlFdmVudC5pbW1lZGlhdGVQcm9wYWdhdGlvblN0b3BwZWQ7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBmdW5jTmFtZSA9IGxpc3RlbmVyc1tpXS5uYW1lO1xuICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lcnNbaV0oaUV2ZW50KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qXFxcbiAgICAgICAgICogSW50ZXJhY3RhYmxlLm9uXG4gICAgICAgICBbIG1ldGhvZCBdXG4gICAgICAgICAqXG4gICAgICAgICAqIEJpbmRzIGEgbGlzdGVuZXIgZm9yIGFuIEludGVyYWN0RXZlbnQgb3IgRE9NIGV2ZW50LlxuICAgICAgICAgKlxuICAgICAgICAgLSBldmVudFR5cGUgIChzdHJpbmcgfCBhcnJheSB8IG9iamVjdCkgVGhlIHR5cGVzIG9mIGV2ZW50cyB0byBsaXN0ZW4gZm9yXG4gICAgICAgICAtIGxpc3RlbmVyICAgKGZ1bmN0aW9uKSBUaGUgZnVuY3Rpb24gdG8gYmUgY2FsbGVkIG9uIHRoZSBnaXZlbiBldmVudChzKVxuICAgICAgICAgLSB1c2VDYXB0dXJlIChib29sZWFuKSAjb3B0aW9uYWwgdXNlQ2FwdHVyZSBmbGFnIGZvciBhZGRFdmVudExpc3RlbmVyXG4gICAgICAgICA9IChvYmplY3QpIFRoaXMgSW50ZXJhY3RhYmxlXG4gICAgICAgIFxcKi9cbiAgICAgICAgb246IGZ1bmN0aW9uIChldmVudFR5cGUsIGxpc3RlbmVyLCB1c2VDYXB0dXJlKSB7XG4gICAgICAgICAgICB2YXIgaTtcblxuICAgICAgICAgICAgaWYgKGlzU3RyaW5nKGV2ZW50VHlwZSkgJiYgZXZlbnRUeXBlLnNlYXJjaCgnICcpICE9PSAtMSkge1xuICAgICAgICAgICAgICAgIGV2ZW50VHlwZSA9IGV2ZW50VHlwZS50cmltKCkuc3BsaXQoLyArLyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpc0FycmF5KGV2ZW50VHlwZSkpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgZXZlbnRUeXBlLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMub24oZXZlbnRUeXBlW2ldLCBsaXN0ZW5lciwgdXNlQ2FwdHVyZSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpc09iamVjdChldmVudFR5cGUpKSB7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgcHJvcCBpbiBldmVudFR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vbihwcm9wLCBldmVudFR5cGVbcHJvcF0sIGxpc3RlbmVyKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGV2ZW50VHlwZSA9PT0gJ3doZWVsJykge1xuICAgICAgICAgICAgICAgIGV2ZW50VHlwZSA9IHdoZWVsRXZlbnQ7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGNvbnZlcnQgdG8gYm9vbGVhblxuICAgICAgICAgICAgdXNlQ2FwdHVyZSA9IHVzZUNhcHR1cmU/IHRydWU6IGZhbHNlO1xuXG4gICAgICAgICAgICBpZiAoY29udGFpbnMoZXZlbnRUeXBlcywgZXZlbnRUeXBlKSkge1xuICAgICAgICAgICAgICAgIC8vIGlmIHRoaXMgdHlwZSBvZiBldmVudCB3YXMgbmV2ZXIgYm91bmQgdG8gdGhpcyBJbnRlcmFjdGFibGVcbiAgICAgICAgICAgICAgICBpZiAoIShldmVudFR5cGUgaW4gdGhpcy5faUV2ZW50cykpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5faUV2ZW50c1tldmVudFR5cGVdID0gW2xpc3RlbmVyXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2lFdmVudHNbZXZlbnRUeXBlXS5wdXNoKGxpc3RlbmVyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBkZWxlZ2F0ZWQgZXZlbnQgZm9yIHNlbGVjdG9yXG4gICAgICAgICAgICBlbHNlIGlmICh0aGlzLnNlbGVjdG9yKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFkZWxlZ2F0ZWRFdmVudHNbZXZlbnRUeXBlXSkge1xuICAgICAgICAgICAgICAgICAgICBkZWxlZ2F0ZWRFdmVudHNbZXZlbnRUeXBlXSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdG9yczogW10sXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250ZXh0cyA6IFtdLFxuICAgICAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXJzOiBbXVxuICAgICAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIGFkZCBkZWxlZ2F0ZSBsaXN0ZW5lciBmdW5jdGlvbnNcbiAgICAgICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGRvY3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnRzLmFkZChkb2N1bWVudHNbaV0sIGV2ZW50VHlwZSwgZGVsZWdhdGVMaXN0ZW5lcik7XG4gICAgICAgICAgICAgICAgICAgICAgICBldmVudHMuYWRkKGRvY3VtZW50c1tpXSwgZXZlbnRUeXBlLCBkZWxlZ2F0ZVVzZUNhcHR1cmUsIHRydWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdmFyIGRlbGVnYXRlZCA9IGRlbGVnYXRlZEV2ZW50c1tldmVudFR5cGVdLFxuICAgICAgICAgICAgICAgICAgICBpbmRleDtcblxuICAgICAgICAgICAgICAgIGZvciAoaW5kZXggPSBkZWxlZ2F0ZWQuc2VsZWN0b3JzLmxlbmd0aCAtIDE7IGluZGV4ID49IDA7IGluZGV4LS0pIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGRlbGVnYXRlZC5zZWxlY3RvcnNbaW5kZXhdID09PSB0aGlzLnNlbGVjdG9yXG4gICAgICAgICAgICAgICAgICAgICAgICAmJiBkZWxlZ2F0ZWQuY29udGV4dHNbaW5kZXhdID09PSB0aGlzLl9jb250ZXh0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChpbmRleCA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgaW5kZXggPSBkZWxlZ2F0ZWQuc2VsZWN0b3JzLmxlbmd0aDtcblxuICAgICAgICAgICAgICAgICAgICBkZWxlZ2F0ZWQuc2VsZWN0b3JzLnB1c2godGhpcy5zZWxlY3Rvcik7XG4gICAgICAgICAgICAgICAgICAgIGRlbGVnYXRlZC5jb250ZXh0cyAucHVzaCh0aGlzLl9jb250ZXh0KTtcbiAgICAgICAgICAgICAgICAgICAgZGVsZWdhdGVkLmxpc3RlbmVycy5wdXNoKFtdKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBrZWVwIGxpc3RlbmVyIGFuZCB1c2VDYXB0dXJlIGZsYWdcbiAgICAgICAgICAgICAgICBkZWxlZ2F0ZWQubGlzdGVuZXJzW2luZGV4XS5wdXNoKFtsaXN0ZW5lciwgdXNlQ2FwdHVyZV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgZXZlbnRzLmFkZCh0aGlzLl9lbGVtZW50LCBldmVudFR5cGUsIGxpc3RlbmVyLCB1c2VDYXB0dXJlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLypcXFxuICAgICAgICAgKiBJbnRlcmFjdGFibGUub2ZmXG4gICAgICAgICBbIG1ldGhvZCBdXG4gICAgICAgICAqXG4gICAgICAgICAqIFJlbW92ZXMgYW4gSW50ZXJhY3RFdmVudCBvciBET00gZXZlbnQgbGlzdGVuZXJcbiAgICAgICAgICpcbiAgICAgICAgIC0gZXZlbnRUeXBlICAoc3RyaW5nIHwgYXJyYXkgfCBvYmplY3QpIFRoZSB0eXBlcyBvZiBldmVudHMgdGhhdCB3ZXJlIGxpc3RlbmVkIGZvclxuICAgICAgICAgLSBsaXN0ZW5lciAgIChmdW5jdGlvbikgVGhlIGxpc3RlbmVyIGZ1bmN0aW9uIHRvIGJlIHJlbW92ZWRcbiAgICAgICAgIC0gdXNlQ2FwdHVyZSAoYm9vbGVhbikgI29wdGlvbmFsIHVzZUNhcHR1cmUgZmxhZyBmb3IgcmVtb3ZlRXZlbnRMaXN0ZW5lclxuICAgICAgICAgPSAob2JqZWN0KSBUaGlzIEludGVyYWN0YWJsZVxuICAgICAgICBcXCovXG4gICAgICAgIG9mZjogZnVuY3Rpb24gKGV2ZW50VHlwZSwgbGlzdGVuZXIsIHVzZUNhcHR1cmUpIHtcbiAgICAgICAgICAgIHZhciBpO1xuXG4gICAgICAgICAgICBpZiAoaXNTdHJpbmcoZXZlbnRUeXBlKSAmJiBldmVudFR5cGUuc2VhcmNoKCcgJykgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgZXZlbnRUeXBlID0gZXZlbnRUeXBlLnRyaW0oKS5zcGxpdCgvICsvKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGlzQXJyYXkoZXZlbnRUeXBlKSkge1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBldmVudFR5cGUubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vZmYoZXZlbnRUeXBlW2ldLCBsaXN0ZW5lciwgdXNlQ2FwdHVyZSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpc09iamVjdChldmVudFR5cGUpKSB7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgcHJvcCBpbiBldmVudFR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vZmYocHJvcCwgZXZlbnRUeXBlW3Byb3BdLCBsaXN0ZW5lcik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBldmVudExpc3QsXG4gICAgICAgICAgICAgICAgaW5kZXggPSAtMTtcblxuICAgICAgICAgICAgLy8gY29udmVydCB0byBib29sZWFuXG4gICAgICAgICAgICB1c2VDYXB0dXJlID0gdXNlQ2FwdHVyZT8gdHJ1ZTogZmFsc2U7XG5cbiAgICAgICAgICAgIGlmIChldmVudFR5cGUgPT09ICd3aGVlbCcpIHtcbiAgICAgICAgICAgICAgICBldmVudFR5cGUgPSB3aGVlbEV2ZW50O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBpZiBpdCBpcyBhbiBhY3Rpb24gZXZlbnQgdHlwZVxuICAgICAgICAgICAgaWYgKGNvbnRhaW5zKGV2ZW50VHlwZXMsIGV2ZW50VHlwZSkpIHtcbiAgICAgICAgICAgICAgICBldmVudExpc3QgPSB0aGlzLl9pRXZlbnRzW2V2ZW50VHlwZV07XG5cbiAgICAgICAgICAgICAgICBpZiAoZXZlbnRMaXN0ICYmIChpbmRleCA9IGluZGV4T2YoZXZlbnRMaXN0LCBsaXN0ZW5lcikpICE9PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9pRXZlbnRzW2V2ZW50VHlwZV0uc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBkZWxlZ2F0ZWQgZXZlbnRcbiAgICAgICAgICAgIGVsc2UgaWYgKHRoaXMuc2VsZWN0b3IpIHtcbiAgICAgICAgICAgICAgICB2YXIgZGVsZWdhdGVkID0gZGVsZWdhdGVkRXZlbnRzW2V2ZW50VHlwZV0sXG4gICAgICAgICAgICAgICAgICAgIG1hdGNoRm91bmQgPSBmYWxzZTtcblxuICAgICAgICAgICAgICAgIGlmICghZGVsZWdhdGVkKSB7IHJldHVybiB0aGlzOyB9XG5cbiAgICAgICAgICAgICAgICAvLyBjb3VudCBmcm9tIGxhc3QgaW5kZXggb2YgZGVsZWdhdGVkIHRvIDBcbiAgICAgICAgICAgICAgICBmb3IgKGluZGV4ID0gZGVsZWdhdGVkLnNlbGVjdG9ycy5sZW5ndGggLSAxOyBpbmRleCA+PSAwOyBpbmRleC0tKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGxvb2sgZm9yIG1hdGNoaW5nIHNlbGVjdG9yIGFuZCBjb250ZXh0IE5vZGVcbiAgICAgICAgICAgICAgICAgICAgaWYgKGRlbGVnYXRlZC5zZWxlY3RvcnNbaW5kZXhdID09PSB0aGlzLnNlbGVjdG9yXG4gICAgICAgICAgICAgICAgICAgICAgICAmJiBkZWxlZ2F0ZWQuY29udGV4dHNbaW5kZXhdID09PSB0aGlzLl9jb250ZXh0KSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBsaXN0ZW5lcnMgPSBkZWxlZ2F0ZWQubGlzdGVuZXJzW2luZGV4XTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gZWFjaCBpdGVtIG9mIHRoZSBsaXN0ZW5lcnMgYXJyYXkgaXMgYW4gYXJyYXk6IFtmdW5jdGlvbiwgdXNlQ2FwdHVyZUZsYWddXG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGkgPSBsaXN0ZW5lcnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgZm4gPSBsaXN0ZW5lcnNbaV1bMF0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVzZUNhcCA9IGxpc3RlbmVyc1tpXVsxXTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGNoZWNrIGlmIHRoZSBsaXN0ZW5lciBmdW5jdGlvbnMgYW5kIHVzZUNhcHR1cmUgZmxhZ3MgbWF0Y2hcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZm4gPT09IGxpc3RlbmVyICYmIHVzZUNhcCA9PT0gdXNlQ2FwdHVyZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyByZW1vdmUgdGhlIGxpc3RlbmVyIGZyb20gdGhlIGFycmF5IG9mIGxpc3RlbmVyc1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lcnMuc3BsaWNlKGksIDEpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlmIGFsbCBsaXN0ZW5lcnMgZm9yIHRoaXMgaW50ZXJhY3RhYmxlIGhhdmUgYmVlbiByZW1vdmVkXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHJlbW92ZSB0aGUgaW50ZXJhY3RhYmxlIGZyb20gdGhlIGRlbGVnYXRlZCBhcnJheXNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFsaXN0ZW5lcnMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWxlZ2F0ZWQuc2VsZWN0b3JzLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWxlZ2F0ZWQuY29udGV4dHMgLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWxlZ2F0ZWQubGlzdGVuZXJzLnNwbGljZShpbmRleCwgMSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHJlbW92ZSBkZWxlZ2F0ZSBmdW5jdGlvbiBmcm9tIGNvbnRleHRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50cy5yZW1vdmUodGhpcy5fY29udGV4dCwgZXZlbnRUeXBlLCBkZWxlZ2F0ZUxpc3RlbmVyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50cy5yZW1vdmUodGhpcy5fY29udGV4dCwgZXZlbnRUeXBlLCBkZWxlZ2F0ZVVzZUNhcHR1cmUsIHRydWUpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyByZW1vdmUgdGhlIGFycmF5cyBpZiB0aGV5IGFyZSBlbXB0eVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFkZWxlZ2F0ZWQuc2VsZWN0b3JzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlbGVnYXRlZEV2ZW50c1tldmVudFR5cGVdID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG9ubHkgcmVtb3ZlIG9uZSBsaXN0ZW5lclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXRjaEZvdW5kID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobWF0Y2hGb3VuZCkgeyBicmVhazsgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gcmVtb3ZlIGxpc3RlbmVyIGZyb20gdGhpcyBJbnRlcmF0YWJsZSdzIGVsZW1lbnRcbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGV2ZW50cy5yZW1vdmUodGhpcy5fZWxlbWVudCwgZXZlbnRUeXBlLCBsaXN0ZW5lciwgdXNlQ2FwdHVyZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qXFxcbiAgICAgICAgICogSW50ZXJhY3RhYmxlLnNldFxuICAgICAgICAgWyBtZXRob2QgXVxuICAgICAgICAgKlxuICAgICAgICAgKiBSZXNldCB0aGUgb3B0aW9ucyBvZiB0aGlzIEludGVyYWN0YWJsZVxuICAgICAgICAgLSBvcHRpb25zIChvYmplY3QpIFRoZSBuZXcgc2V0dGluZ3MgdG8gYXBwbHlcbiAgICAgICAgID0gKG9iamVjdCkgVGhpcyBJbnRlcmFjdGFibGVcbiAgICAgICAgXFwqL1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICBpZiAoIWlzT2JqZWN0KG9wdGlvbnMpKSB7XG4gICAgICAgICAgICAgICAgb3B0aW9ucyA9IHt9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLm9wdGlvbnMgPSBleHRlbmQoe30sIGRlZmF1bHRPcHRpb25zLmJhc2UpO1xuXG4gICAgICAgICAgICB2YXIgaSxcbiAgICAgICAgICAgICAgICBhY3Rpb25zID0gWydkcmFnJywgJ2Ryb3AnLCAncmVzaXplJywgJ2dlc3R1cmUnXSxcbiAgICAgICAgICAgICAgICBtZXRob2RzID0gWydkcmFnZ2FibGUnLCAnZHJvcHpvbmUnLCAncmVzaXphYmxlJywgJ2dlc3R1cmFibGUnXSxcbiAgICAgICAgICAgICAgICBwZXJBY3Rpb25zID0gZXh0ZW5kKGV4dGVuZCh7fSwgZGVmYXVsdE9wdGlvbnMucGVyQWN0aW9uKSwgb3B0aW9uc1thY3Rpb25dIHx8IHt9KTtcblxuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGFjdGlvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgYWN0aW9uID0gYWN0aW9uc1tpXTtcblxuICAgICAgICAgICAgICAgIHRoaXMub3B0aW9uc1thY3Rpb25dID0gZXh0ZW5kKHt9LCBkZWZhdWx0T3B0aW9uc1thY3Rpb25dKTtcblxuICAgICAgICAgICAgICAgIHRoaXMuc2V0UGVyQWN0aW9uKGFjdGlvbiwgcGVyQWN0aW9ucyk7XG5cbiAgICAgICAgICAgICAgICB0aGlzW21ldGhvZHNbaV1dKG9wdGlvbnNbYWN0aW9uXSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBzZXR0aW5ncyA9IFtcbiAgICAgICAgICAgICAgICAgICAgJ2FjY2VwdCcsICdhY3Rpb25DaGVja2VyJywgJ2FsbG93RnJvbScsICdkZWx0YVNvdXJjZScsXG4gICAgICAgICAgICAgICAgICAgICdkcm9wQ2hlY2tlcicsICdpZ25vcmVGcm9tJywgJ29yaWdpbicsICdwcmV2ZW50RGVmYXVsdCcsXG4gICAgICAgICAgICAgICAgICAgICdyZWN0Q2hlY2tlcicsICdzdHlsZUN1cnNvcidcbiAgICAgICAgICAgICAgICBdO1xuXG4gICAgICAgICAgICBmb3IgKGkgPSAwLCBsZW4gPSBzZXR0aW5ncy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgICAgICAgIHZhciBzZXR0aW5nID0gc2V0dGluZ3NbaV07XG5cbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnNbc2V0dGluZ10gPSBkZWZhdWx0T3B0aW9ucy5iYXNlW3NldHRpbmddO1xuXG4gICAgICAgICAgICAgICAgaWYgKHNldHRpbmcgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgICAgICAgICB0aGlzW3NldHRpbmddKG9wdGlvbnNbc2V0dGluZ10pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLypcXFxuICAgICAgICAgKiBJbnRlcmFjdGFibGUudW5zZXRcbiAgICAgICAgIFsgbWV0aG9kIF1cbiAgICAgICAgICpcbiAgICAgICAgICogUmVtb3ZlIHRoaXMgaW50ZXJhY3RhYmxlIGZyb20gdGhlIGxpc3Qgb2YgaW50ZXJhY3RhYmxlcyBhbmQgcmVtb3ZlXG4gICAgICAgICAqIGl0J3MgZHJhZywgZHJvcCwgcmVzaXplIGFuZCBnZXN0dXJlIGNhcGFiaWxpdGllc1xuICAgICAgICAgKlxuICAgICAgICAgPSAob2JqZWN0KSBAaW50ZXJhY3RcbiAgICAgICAgXFwqL1xuICAgICAgICB1bnNldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgZXZlbnRzLnJlbW92ZSh0aGlzLl9lbGVtZW50LCAnYWxsJyk7XG5cbiAgICAgICAgICAgIGlmICghaXNTdHJpbmcodGhpcy5zZWxlY3RvcikpIHtcbiAgICAgICAgICAgICAgICBldmVudHMucmVtb3ZlKHRoaXMsICdhbGwnKTtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5vcHRpb25zLnN0eWxlQ3Vyc29yKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2VsZW1lbnQuc3R5bGUuY3Vyc29yID0gJyc7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gcmVtb3ZlIGRlbGVnYXRlZCBldmVudHNcbiAgICAgICAgICAgICAgICBmb3IgKHZhciB0eXBlIGluIGRlbGVnYXRlZEV2ZW50cykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZGVsZWdhdGVkID0gZGVsZWdhdGVkRXZlbnRzW3R5cGVdO1xuXG4gICAgICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZGVsZWdhdGVkLnNlbGVjdG9ycy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRlbGVnYXRlZC5zZWxlY3RvcnNbaV0gPT09IHRoaXMuc2VsZWN0b3JcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAmJiBkZWxlZ2F0ZWQuY29udGV4dHNbaV0gPT09IHRoaXMuX2NvbnRleHQpIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlbGVnYXRlZC5zZWxlY3RvcnMuc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlbGVnYXRlZC5jb250ZXh0cyAuc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlbGVnYXRlZC5saXN0ZW5lcnMuc3BsaWNlKGksIDEpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gcmVtb3ZlIHRoZSBhcnJheXMgaWYgdGhleSBhcmUgZW1wdHlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWRlbGVnYXRlZC5zZWxlY3RvcnMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlbGVnYXRlZEV2ZW50c1t0eXBlXSA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBldmVudHMucmVtb3ZlKHRoaXMuX2NvbnRleHQsIHR5cGUsIGRlbGVnYXRlTGlzdGVuZXIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnRzLnJlbW92ZSh0aGlzLl9jb250ZXh0LCB0eXBlLCBkZWxlZ2F0ZVVzZUNhcHR1cmUsIHRydWUpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5kcm9wem9uZShmYWxzZSk7XG5cbiAgICAgICAgICAgIGludGVyYWN0YWJsZXMuc3BsaWNlKGluZGV4T2YoaW50ZXJhY3RhYmxlcywgdGhpcyksIDEpO1xuXG4gICAgICAgICAgICByZXR1cm4gaW50ZXJhY3Q7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgZnVuY3Rpb24gd2Fybk9uY2UgKG1ldGhvZCwgbWVzc2FnZSkge1xuICAgICAgICB2YXIgd2FybmVkID0gZmFsc2U7XG5cbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmICghd2FybmVkKSB7XG4gICAgICAgICAgICAgICAgd2luZG93LmNvbnNvbGUud2FybihtZXNzYWdlKTtcbiAgICAgICAgICAgICAgICB3YXJuZWQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gbWV0aG9kLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgSW50ZXJhY3RhYmxlLnByb3RvdHlwZS5zbmFwID0gd2Fybk9uY2UoSW50ZXJhY3RhYmxlLnByb3RvdHlwZS5zbmFwLFxuICAgICAgICAgJ0ludGVyYWN0YWJsZSNzbmFwIGlzIGRlcHJlY2F0ZWQuIFNlZSB0aGUgbmV3IGRvY3VtZW50YXRpb24gZm9yIHNuYXBwaW5nIGF0IGh0dHA6Ly9pbnRlcmFjdGpzLmlvL2RvY3Mvc25hcHBpbmcnKTtcbiAgICBJbnRlcmFjdGFibGUucHJvdG90eXBlLnJlc3RyaWN0ID0gd2Fybk9uY2UoSW50ZXJhY3RhYmxlLnByb3RvdHlwZS5yZXN0cmljdCxcbiAgICAgICAgICdJbnRlcmFjdGFibGUjcmVzdHJpY3QgaXMgZGVwcmVjYXRlZC4gU2VlIHRoZSBuZXcgZG9jdW1lbnRhdGlvbiBmb3IgcmVzdGljdGluZyBhdCBodHRwOi8vaW50ZXJhY3Rqcy5pby9kb2NzL3Jlc3RyaWN0aW9uJyk7XG4gICAgSW50ZXJhY3RhYmxlLnByb3RvdHlwZS5pbmVydGlhID0gd2Fybk9uY2UoSW50ZXJhY3RhYmxlLnByb3RvdHlwZS5pbmVydGlhLFxuICAgICAgICAgJ0ludGVyYWN0YWJsZSNpbmVydGlhIGlzIGRlcHJlY2F0ZWQuIFNlZSB0aGUgbmV3IGRvY3VtZW50YXRpb24gZm9yIGluZXJ0aWEgYXQgaHR0cDovL2ludGVyYWN0anMuaW8vZG9jcy9pbmVydGlhJyk7XG4gICAgSW50ZXJhY3RhYmxlLnByb3RvdHlwZS5hdXRvU2Nyb2xsID0gd2Fybk9uY2UoSW50ZXJhY3RhYmxlLnByb3RvdHlwZS5hdXRvU2Nyb2xsLFxuICAgICAgICAgJ0ludGVyYWN0YWJsZSNhdXRvU2Nyb2xsIGlzIGRlcHJlY2F0ZWQuIFNlZSB0aGUgbmV3IGRvY3VtZW50YXRpb24gZm9yIGF1dG9TY3JvbGwgYXQgaHR0cDovL2ludGVyYWN0anMuaW8vZG9jcy8jYXV0b3Njcm9sbCcpO1xuICAgIEludGVyYWN0YWJsZS5wcm90b3R5cGUuc3F1YXJlUmVzaXplID0gd2Fybk9uY2UoSW50ZXJhY3RhYmxlLnByb3RvdHlwZS5zcXVhcmVSZXNpemUsXG4gICAgICAgICAnSW50ZXJhY3RhYmxlI3NxdWFyZVJlc2l6ZSBpcyBkZXByZWNhdGVkLiBTZWUgaHR0cDovL2ludGVyYWN0anMuaW8vZG9jcy8jcmVzaXplLXNxdWFyZScpO1xuXG4gICAgSW50ZXJhY3RhYmxlLnByb3RvdHlwZS5hY2NlcHQgPSB3YXJuT25jZShJbnRlcmFjdGFibGUucHJvdG90eXBlLmFjY2VwdCxcbiAgICAgICAgICdJbnRlcmFjdGFibGUjYWNjZXB0IGlzIGRlcHJlY2F0ZWQuIHVzZSBJbnRlcmFjdGFibGUjZHJvcHpvbmUoeyBhY2NlcHQ6IHRhcmdldCB9KSBpbnN0ZWFkJyk7XG4gICAgSW50ZXJhY3RhYmxlLnByb3RvdHlwZS5kcm9wQ2hlY2tlciA9IHdhcm5PbmNlKEludGVyYWN0YWJsZS5wcm90b3R5cGUuZHJvcENoZWNrZXIsXG4gICAgICAgICAnSW50ZXJhY3RhYmxlI2Ryb3BDaGVja2VyIGlzIGRlcHJlY2F0ZWQuIHVzZSBJbnRlcmFjdGFibGUjZHJvcHpvbmUoeyBkcm9wQ2hlY2tlcjogY2hlY2tlckZ1bmN0aW9uIH0pIGluc3RlYWQnKTtcbiAgICBJbnRlcmFjdGFibGUucHJvdG90eXBlLmNvbnRleHQgPSB3YXJuT25jZShJbnRlcmFjdGFibGUucHJvdG90eXBlLmNvbnRleHQsXG4gICAgICAgICAnSW50ZXJhY3RhYmxlI2NvbnRleHQgYXMgYSBtZXRob2QgaXMgZGVwcmVjYXRlZC4gSXQgd2lsbCBzb29uIGJlIGEgRE9NIE5vZGUgaW5zdGVhZCcpO1xuXG4gICAgLypcXFxuICAgICAqIGludGVyYWN0LmlzU2V0XG4gICAgIFsgbWV0aG9kIF1cbiAgICAgKlxuICAgICAqIENoZWNrIGlmIGFuIGVsZW1lbnQgaGFzIGJlZW4gc2V0XG4gICAgIC0gZWxlbWVudCAoRWxlbWVudCkgVGhlIEVsZW1lbnQgYmVpbmcgc2VhcmNoZWQgZm9yXG4gICAgID0gKGJvb2xlYW4pIEluZGljYXRlcyBpZiB0aGUgZWxlbWVudCBvciBDU1Mgc2VsZWN0b3Igd2FzIHByZXZpb3VzbHkgcGFzc2VkIHRvIGludGVyYWN0XG4gICAgXFwqL1xuICAgIGludGVyYWN0LmlzU2V0ID0gZnVuY3Rpb24oZWxlbWVudCwgb3B0aW9ucykge1xuICAgICAgICByZXR1cm4gaW50ZXJhY3RhYmxlcy5pbmRleE9mRWxlbWVudChlbGVtZW50LCBvcHRpb25zICYmIG9wdGlvbnMuY29udGV4dCkgIT09IC0xO1xuICAgIH07XG5cbiAgICAvKlxcXG4gICAgICogaW50ZXJhY3Qub25cbiAgICAgWyBtZXRob2QgXVxuICAgICAqXG4gICAgICogQWRkcyBhIGdsb2JhbCBsaXN0ZW5lciBmb3IgYW4gSW50ZXJhY3RFdmVudCBvciBhZGRzIGEgRE9NIGV2ZW50IHRvXG4gICAgICogYGRvY3VtZW50YFxuICAgICAqXG4gICAgIC0gdHlwZSAgICAgICAoc3RyaW5nIHwgYXJyYXkgfCBvYmplY3QpIFRoZSB0eXBlcyBvZiBldmVudHMgdG8gbGlzdGVuIGZvclxuICAgICAtIGxpc3RlbmVyICAgKGZ1bmN0aW9uKSBUaGUgZnVuY3Rpb24gdG8gYmUgY2FsbGVkIG9uIHRoZSBnaXZlbiBldmVudChzKVxuICAgICAtIHVzZUNhcHR1cmUgKGJvb2xlYW4pICNvcHRpb25hbCB1c2VDYXB0dXJlIGZsYWcgZm9yIGFkZEV2ZW50TGlzdGVuZXJcbiAgICAgPSAob2JqZWN0KSBpbnRlcmFjdFxuICAgIFxcKi9cbiAgICBpbnRlcmFjdC5vbiA9IGZ1bmN0aW9uICh0eXBlLCBsaXN0ZW5lciwgdXNlQ2FwdHVyZSkge1xuICAgICAgICBpZiAoaXNTdHJpbmcodHlwZSkgJiYgdHlwZS5zZWFyY2goJyAnKSAhPT0gLTEpIHtcbiAgICAgICAgICAgIHR5cGUgPSB0eXBlLnRyaW0oKS5zcGxpdCgvICsvKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChpc0FycmF5KHR5cGUpKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHR5cGUubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBpbnRlcmFjdC5vbih0eXBlW2ldLCBsaXN0ZW5lciwgdXNlQ2FwdHVyZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBpbnRlcmFjdDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChpc09iamVjdCh0eXBlKSkge1xuICAgICAgICAgICAgZm9yICh2YXIgcHJvcCBpbiB0eXBlKSB7XG4gICAgICAgICAgICAgICAgaW50ZXJhY3Qub24ocHJvcCwgdHlwZVtwcm9wXSwgbGlzdGVuZXIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gaW50ZXJhY3Q7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBpZiBpdCBpcyBhbiBJbnRlcmFjdEV2ZW50IHR5cGUsIGFkZCBsaXN0ZW5lciB0byBnbG9iYWxFdmVudHNcbiAgICAgICAgaWYgKGNvbnRhaW5zKGV2ZW50VHlwZXMsIHR5cGUpKSB7XG4gICAgICAgICAgICAvLyBpZiB0aGlzIHR5cGUgb2YgZXZlbnQgd2FzIG5ldmVyIGJvdW5kXG4gICAgICAgICAgICBpZiAoIWdsb2JhbEV2ZW50c1t0eXBlXSkge1xuICAgICAgICAgICAgICAgIGdsb2JhbEV2ZW50c1t0eXBlXSA9IFtsaXN0ZW5lcl07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBnbG9iYWxFdmVudHNbdHlwZV0ucHVzaChsaXN0ZW5lcik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gSWYgbm9uIEludGVyYWN0RXZlbnQgdHlwZSwgYWRkRXZlbnRMaXN0ZW5lciB0byBkb2N1bWVudFxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGV2ZW50cy5hZGQoZG9jdW1lbnQsIHR5cGUsIGxpc3RlbmVyLCB1c2VDYXB0dXJlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBpbnRlcmFjdDtcbiAgICB9O1xuXG4gICAgLypcXFxuICAgICAqIGludGVyYWN0Lm9mZlxuICAgICBbIG1ldGhvZCBdXG4gICAgICpcbiAgICAgKiBSZW1vdmVzIGEgZ2xvYmFsIEludGVyYWN0RXZlbnQgbGlzdGVuZXIgb3IgRE9NIGV2ZW50IGZyb20gYGRvY3VtZW50YFxuICAgICAqXG4gICAgIC0gdHlwZSAgICAgICAoc3RyaW5nIHwgYXJyYXkgfCBvYmplY3QpIFRoZSB0eXBlcyBvZiBldmVudHMgdGhhdCB3ZXJlIGxpc3RlbmVkIGZvclxuICAgICAtIGxpc3RlbmVyICAgKGZ1bmN0aW9uKSBUaGUgbGlzdGVuZXIgZnVuY3Rpb24gdG8gYmUgcmVtb3ZlZFxuICAgICAtIHVzZUNhcHR1cmUgKGJvb2xlYW4pICNvcHRpb25hbCB1c2VDYXB0dXJlIGZsYWcgZm9yIHJlbW92ZUV2ZW50TGlzdGVuZXJcbiAgICAgPSAob2JqZWN0KSBpbnRlcmFjdFxuICAgICBcXCovXG4gICAgaW50ZXJhY3Qub2ZmID0gZnVuY3Rpb24gKHR5cGUsIGxpc3RlbmVyLCB1c2VDYXB0dXJlKSB7XG4gICAgICAgIGlmIChpc1N0cmluZyh0eXBlKSAmJiB0eXBlLnNlYXJjaCgnICcpICE9PSAtMSkge1xuICAgICAgICAgICAgdHlwZSA9IHR5cGUudHJpbSgpLnNwbGl0KC8gKy8pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlzQXJyYXkodHlwZSkpIHtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdHlwZS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGludGVyYWN0Lm9mZih0eXBlW2ldLCBsaXN0ZW5lciwgdXNlQ2FwdHVyZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBpbnRlcmFjdDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChpc09iamVjdCh0eXBlKSkge1xuICAgICAgICAgICAgZm9yICh2YXIgcHJvcCBpbiB0eXBlKSB7XG4gICAgICAgICAgICAgICAgaW50ZXJhY3Qub2ZmKHByb3AsIHR5cGVbcHJvcF0sIGxpc3RlbmVyKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGludGVyYWN0O1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFjb250YWlucyhldmVudFR5cGVzLCB0eXBlKSkge1xuICAgICAgICAgICAgZXZlbnRzLnJlbW92ZShkb2N1bWVudCwgdHlwZSwgbGlzdGVuZXIsIHVzZUNhcHR1cmUpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIGluZGV4O1xuXG4gICAgICAgICAgICBpZiAodHlwZSBpbiBnbG9iYWxFdmVudHNcbiAgICAgICAgICAgICAgICAmJiAoaW5kZXggPSBpbmRleE9mKGdsb2JhbEV2ZW50c1t0eXBlXSwgbGlzdGVuZXIpKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICBnbG9iYWxFdmVudHNbdHlwZV0uc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBpbnRlcmFjdDtcbiAgICB9O1xuXG4gICAgLypcXFxuICAgICAqIGludGVyYWN0LmVuYWJsZURyYWdnaW5nXG4gICAgIFsgbWV0aG9kIF1cbiAgICAgKlxuICAgICAqIERlcHJlY2F0ZWQuXG4gICAgICpcbiAgICAgKiBSZXR1cm5zIG9yIHNldHMgd2hldGhlciBkcmFnZ2luZyBpcyBlbmFibGVkIGZvciBhbnkgSW50ZXJhY3RhYmxlc1xuICAgICAqXG4gICAgIC0gbmV3VmFsdWUgKGJvb2xlYW4pICNvcHRpb25hbCBgdHJ1ZWAgdG8gYWxsb3cgdGhlIGFjdGlvbjsgYGZhbHNlYCB0byBkaXNhYmxlIGFjdGlvbiBmb3IgYWxsIEludGVyYWN0YWJsZXNcbiAgICAgPSAoYm9vbGVhbiB8IG9iamVjdCkgVGhlIGN1cnJlbnQgc2V0dGluZyBvciBpbnRlcmFjdFxuICAgIFxcKi9cbiAgICBpbnRlcmFjdC5lbmFibGVEcmFnZ2luZyA9IHdhcm5PbmNlKGZ1bmN0aW9uIChuZXdWYWx1ZSkge1xuICAgICAgICBpZiAobmV3VmFsdWUgIT09IG51bGwgJiYgbmV3VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgYWN0aW9uSXNFbmFibGVkLmRyYWcgPSBuZXdWYWx1ZTtcblxuICAgICAgICAgICAgcmV0dXJuIGludGVyYWN0O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBhY3Rpb25Jc0VuYWJsZWQuZHJhZztcbiAgICB9LCAnaW50ZXJhY3QuZW5hYmxlRHJhZ2dpbmcgaXMgZGVwcmVjYXRlZCBhbmQgd2lsbCBzb29uIGJlIHJlbW92ZWQuJyk7XG5cbiAgICAvKlxcXG4gICAgICogaW50ZXJhY3QuZW5hYmxlUmVzaXppbmdcbiAgICAgWyBtZXRob2QgXVxuICAgICAqXG4gICAgICogRGVwcmVjYXRlZC5cbiAgICAgKlxuICAgICAqIFJldHVybnMgb3Igc2V0cyB3aGV0aGVyIHJlc2l6aW5nIGlzIGVuYWJsZWQgZm9yIGFueSBJbnRlcmFjdGFibGVzXG4gICAgICpcbiAgICAgLSBuZXdWYWx1ZSAoYm9vbGVhbikgI29wdGlvbmFsIGB0cnVlYCB0byBhbGxvdyB0aGUgYWN0aW9uOyBgZmFsc2VgIHRvIGRpc2FibGUgYWN0aW9uIGZvciBhbGwgSW50ZXJhY3RhYmxlc1xuICAgICA9IChib29sZWFuIHwgb2JqZWN0KSBUaGUgY3VycmVudCBzZXR0aW5nIG9yIGludGVyYWN0XG4gICAgXFwqL1xuICAgIGludGVyYWN0LmVuYWJsZVJlc2l6aW5nID0gd2Fybk9uY2UoZnVuY3Rpb24gKG5ld1ZhbHVlKSB7XG4gICAgICAgIGlmIChuZXdWYWx1ZSAhPT0gbnVsbCAmJiBuZXdWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBhY3Rpb25Jc0VuYWJsZWQucmVzaXplID0gbmV3VmFsdWU7XG5cbiAgICAgICAgICAgIHJldHVybiBpbnRlcmFjdDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYWN0aW9uSXNFbmFibGVkLnJlc2l6ZTtcbiAgICB9LCAnaW50ZXJhY3QuZW5hYmxlUmVzaXppbmcgaXMgZGVwcmVjYXRlZCBhbmQgd2lsbCBzb29uIGJlIHJlbW92ZWQuJyk7XG5cbiAgICAvKlxcXG4gICAgICogaW50ZXJhY3QuZW5hYmxlR2VzdHVyaW5nXG4gICAgIFsgbWV0aG9kIF1cbiAgICAgKlxuICAgICAqIERlcHJlY2F0ZWQuXG4gICAgICpcbiAgICAgKiBSZXR1cm5zIG9yIHNldHMgd2hldGhlciBnZXN0dXJpbmcgaXMgZW5hYmxlZCBmb3IgYW55IEludGVyYWN0YWJsZXNcbiAgICAgKlxuICAgICAtIG5ld1ZhbHVlIChib29sZWFuKSAjb3B0aW9uYWwgYHRydWVgIHRvIGFsbG93IHRoZSBhY3Rpb247IGBmYWxzZWAgdG8gZGlzYWJsZSBhY3Rpb24gZm9yIGFsbCBJbnRlcmFjdGFibGVzXG4gICAgID0gKGJvb2xlYW4gfCBvYmplY3QpIFRoZSBjdXJyZW50IHNldHRpbmcgb3IgaW50ZXJhY3RcbiAgICBcXCovXG4gICAgaW50ZXJhY3QuZW5hYmxlR2VzdHVyaW5nID0gd2Fybk9uY2UoZnVuY3Rpb24gKG5ld1ZhbHVlKSB7XG4gICAgICAgIGlmIChuZXdWYWx1ZSAhPT0gbnVsbCAmJiBuZXdWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBhY3Rpb25Jc0VuYWJsZWQuZ2VzdHVyZSA9IG5ld1ZhbHVlO1xuXG4gICAgICAgICAgICByZXR1cm4gaW50ZXJhY3Q7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGFjdGlvbklzRW5hYmxlZC5nZXN0dXJlO1xuICAgIH0sICdpbnRlcmFjdC5lbmFibGVHZXN0dXJpbmcgaXMgZGVwcmVjYXRlZCBhbmQgd2lsbCBzb29uIGJlIHJlbW92ZWQuJyk7XG5cbiAgICBpbnRlcmFjdC5ldmVudFR5cGVzID0gZXZlbnRUeXBlcztcblxuICAgIC8qXFxcbiAgICAgKiBpbnRlcmFjdC5kZWJ1Z1xuICAgICBbIG1ldGhvZCBdXG4gICAgICpcbiAgICAgKiBSZXR1cm5zIGRlYnVnZ2luZyBkYXRhXG4gICAgID0gKG9iamVjdCkgQW4gb2JqZWN0IHdpdGggcHJvcGVydGllcyB0aGF0IG91dGxpbmUgdGhlIGN1cnJlbnQgc3RhdGUgYW5kIGV4cG9zZSBpbnRlcm5hbCBmdW5jdGlvbnMgYW5kIHZhcmlhYmxlc1xuICAgIFxcKi9cbiAgICBpbnRlcmFjdC5kZWJ1ZyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGludGVyYWN0aW9uID0gaW50ZXJhY3Rpb25zWzBdIHx8IG5ldyBJbnRlcmFjdGlvbigpO1xuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBpbnRlcmFjdGlvbnMgICAgICAgICAgOiBpbnRlcmFjdGlvbnMsXG4gICAgICAgICAgICB0YXJnZXQgICAgICAgICAgICAgICAgOiBpbnRlcmFjdGlvbi50YXJnZXQsXG4gICAgICAgICAgICBkcmFnZ2luZyAgICAgICAgICAgICAgOiBpbnRlcmFjdGlvbi5kcmFnZ2luZyxcbiAgICAgICAgICAgIHJlc2l6aW5nICAgICAgICAgICAgICA6IGludGVyYWN0aW9uLnJlc2l6aW5nLFxuICAgICAgICAgICAgZ2VzdHVyaW5nICAgICAgICAgICAgIDogaW50ZXJhY3Rpb24uZ2VzdHVyaW5nLFxuICAgICAgICAgICAgcHJlcGFyZWQgICAgICAgICAgICAgIDogaW50ZXJhY3Rpb24ucHJlcGFyZWQsXG4gICAgICAgICAgICBtYXRjaGVzICAgICAgICAgICAgICAgOiBpbnRlcmFjdGlvbi5tYXRjaGVzLFxuICAgICAgICAgICAgbWF0Y2hFbGVtZW50cyAgICAgICAgIDogaW50ZXJhY3Rpb24ubWF0Y2hFbGVtZW50cyxcblxuICAgICAgICAgICAgcHJldkNvb3JkcyAgICAgICAgICAgIDogaW50ZXJhY3Rpb24ucHJldkNvb3JkcyxcbiAgICAgICAgICAgIHN0YXJ0Q29vcmRzICAgICAgICAgICA6IGludGVyYWN0aW9uLnN0YXJ0Q29vcmRzLFxuXG4gICAgICAgICAgICBwb2ludGVySWRzICAgICAgICAgICAgOiBpbnRlcmFjdGlvbi5wb2ludGVySWRzLFxuICAgICAgICAgICAgcG9pbnRlcnMgICAgICAgICAgICAgIDogaW50ZXJhY3Rpb24ucG9pbnRlcnMsXG4gICAgICAgICAgICBhZGRQb2ludGVyICAgICAgICAgICAgOiBsaXN0ZW5lcnMuYWRkUG9pbnRlcixcbiAgICAgICAgICAgIHJlbW92ZVBvaW50ZXIgICAgICAgICA6IGxpc3RlbmVycy5yZW1vdmVQb2ludGVyLFxuICAgICAgICAgICAgcmVjb3JkUG9pbnRlciAgICAgICAgOiBsaXN0ZW5lcnMucmVjb3JkUG9pbnRlcixcblxuICAgICAgICAgICAgc25hcCAgICAgICAgICAgICAgICAgIDogaW50ZXJhY3Rpb24uc25hcFN0YXR1cyxcbiAgICAgICAgICAgIHJlc3RyaWN0ICAgICAgICAgICAgICA6IGludGVyYWN0aW9uLnJlc3RyaWN0U3RhdHVzLFxuICAgICAgICAgICAgaW5lcnRpYSAgICAgICAgICAgICAgIDogaW50ZXJhY3Rpb24uaW5lcnRpYVN0YXR1cyxcblxuICAgICAgICAgICAgZG93blRpbWUgICAgICAgICAgICAgIDogaW50ZXJhY3Rpb24uZG93blRpbWVzWzBdLFxuICAgICAgICAgICAgZG93bkV2ZW50ICAgICAgICAgICAgIDogaW50ZXJhY3Rpb24uZG93bkV2ZW50LFxuICAgICAgICAgICAgZG93blBvaW50ZXIgICAgICAgICAgIDogaW50ZXJhY3Rpb24uZG93blBvaW50ZXIsXG4gICAgICAgICAgICBwcmV2RXZlbnQgICAgICAgICAgICAgOiBpbnRlcmFjdGlvbi5wcmV2RXZlbnQsXG5cbiAgICAgICAgICAgIEludGVyYWN0YWJsZSAgICAgICAgICA6IEludGVyYWN0YWJsZSxcbiAgICAgICAgICAgIGludGVyYWN0YWJsZXMgICAgICAgICA6IGludGVyYWN0YWJsZXMsXG4gICAgICAgICAgICBwb2ludGVySXNEb3duICAgICAgICAgOiBpbnRlcmFjdGlvbi5wb2ludGVySXNEb3duLFxuICAgICAgICAgICAgZGVmYXVsdE9wdGlvbnMgICAgICAgIDogZGVmYXVsdE9wdGlvbnMsXG4gICAgICAgICAgICBkZWZhdWx0QWN0aW9uQ2hlY2tlciAgOiBkZWZhdWx0QWN0aW9uQ2hlY2tlcixcblxuICAgICAgICAgICAgYWN0aW9uQ3Vyc29ycyAgICAgICAgIDogYWN0aW9uQ3Vyc29ycyxcbiAgICAgICAgICAgIGRyYWdNb3ZlICAgICAgICAgICAgICA6IGxpc3RlbmVycy5kcmFnTW92ZSxcbiAgICAgICAgICAgIHJlc2l6ZU1vdmUgICAgICAgICAgICA6IGxpc3RlbmVycy5yZXNpemVNb3ZlLFxuICAgICAgICAgICAgZ2VzdHVyZU1vdmUgICAgICAgICAgIDogbGlzdGVuZXJzLmdlc3R1cmVNb3ZlLFxuICAgICAgICAgICAgcG9pbnRlclVwICAgICAgICAgICAgIDogbGlzdGVuZXJzLnBvaW50ZXJVcCxcbiAgICAgICAgICAgIHBvaW50ZXJEb3duICAgICAgICAgICA6IGxpc3RlbmVycy5wb2ludGVyRG93bixcbiAgICAgICAgICAgIHBvaW50ZXJNb3ZlICAgICAgICAgICA6IGxpc3RlbmVycy5wb2ludGVyTW92ZSxcbiAgICAgICAgICAgIHBvaW50ZXJIb3ZlciAgICAgICAgICA6IGxpc3RlbmVycy5wb2ludGVySG92ZXIsXG5cbiAgICAgICAgICAgIGV2ZW50VHlwZXMgICAgICAgICAgICA6IGV2ZW50VHlwZXMsXG5cbiAgICAgICAgICAgIGV2ZW50cyAgICAgICAgICAgICAgICA6IGV2ZW50cyxcbiAgICAgICAgICAgIGdsb2JhbEV2ZW50cyAgICAgICAgICA6IGdsb2JhbEV2ZW50cyxcbiAgICAgICAgICAgIGRlbGVnYXRlZEV2ZW50cyAgICAgICA6IGRlbGVnYXRlZEV2ZW50cyxcblxuICAgICAgICAgICAgcHJlZml4ZWRQcm9wUkVzICAgICAgIDogcHJlZml4ZWRQcm9wUkVzXG4gICAgICAgIH07XG4gICAgfTtcblxuICAgIC8vIGV4cG9zZSB0aGUgZnVuY3Rpb25zIHVzZWQgdG8gY2FsY3VsYXRlIG11bHRpLXRvdWNoIHByb3BlcnRpZXNcbiAgICBpbnRlcmFjdC5nZXRQb2ludGVyQXZlcmFnZSA9IHBvaW50ZXJBdmVyYWdlO1xuICAgIGludGVyYWN0LmdldFRvdWNoQkJveCAgICAgPSB0b3VjaEJCb3g7XG4gICAgaW50ZXJhY3QuZ2V0VG91Y2hEaXN0YW5jZSA9IHRvdWNoRGlzdGFuY2U7XG4gICAgaW50ZXJhY3QuZ2V0VG91Y2hBbmdsZSAgICA9IHRvdWNoQW5nbGU7XG5cbiAgICBpbnRlcmFjdC5nZXRFbGVtZW50UmVjdCAgICAgICAgID0gZ2V0RWxlbWVudFJlY3Q7XG4gICAgaW50ZXJhY3QuZ2V0RWxlbWVudENsaWVudFJlY3QgICA9IGdldEVsZW1lbnRDbGllbnRSZWN0O1xuICAgIGludGVyYWN0Lm1hdGNoZXNTZWxlY3RvciAgICAgICAgPSBtYXRjaGVzU2VsZWN0b3I7XG4gICAgaW50ZXJhY3QuY2xvc2VzdCAgICAgICAgICAgICAgICA9IGNsb3Nlc3Q7XG5cbiAgICAvKlxcXG4gICAgICogaW50ZXJhY3QubWFyZ2luXG4gICAgIFsgbWV0aG9kIF1cbiAgICAgKlxuICAgICAqIERlcHJlY2F0ZWQuIFVzZSBgaW50ZXJhY3QodGFyZ2V0KS5yZXNpemFibGUoeyBtYXJnaW46IG51bWJlciB9KTtgIGluc3RlYWQuXG4gICAgICogUmV0dXJucyBvciBzZXRzIHRoZSBtYXJnaW4gZm9yIGF1dG9jaGVjayByZXNpemluZyB1c2VkIGluXG4gICAgICogQEludGVyYWN0YWJsZS5nZXRBY3Rpb24uIFRoYXQgaXMgdGhlIGRpc3RhbmNlIGZyb20gdGhlIGJvdHRvbSBhbmQgcmlnaHRcbiAgICAgKiBlZGdlcyBvZiBhbiBlbGVtZW50IGNsaWNraW5nIGluIHdoaWNoIHdpbGwgc3RhcnQgcmVzaXppbmdcbiAgICAgKlxuICAgICAtIG5ld1ZhbHVlIChudW1iZXIpICNvcHRpb25hbFxuICAgICA9IChudW1iZXIgfCBpbnRlcmFjdCkgVGhlIGN1cnJlbnQgbWFyZ2luIHZhbHVlIG9yIGludGVyYWN0XG4gICAgXFwqL1xuICAgIGludGVyYWN0Lm1hcmdpbiA9IHdhcm5PbmNlKGZ1bmN0aW9uIChuZXd2YWx1ZSkge1xuICAgICAgICBpZiAoaXNOdW1iZXIobmV3dmFsdWUpKSB7XG4gICAgICAgICAgICBtYXJnaW4gPSBuZXd2YWx1ZTtcblxuICAgICAgICAgICAgcmV0dXJuIGludGVyYWN0O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtYXJnaW47XG4gICAgfSxcbiAgICAnaW50ZXJhY3QubWFyZ2luIGlzIGRlcHJlY2F0ZWQuIFVzZSBpbnRlcmFjdCh0YXJnZXQpLnJlc2l6YWJsZSh7IG1hcmdpbjogbnVtYmVyIH0pOyBpbnN0ZWFkLicpIDtcblxuICAgIC8qXFxcbiAgICAgKiBpbnRlcmFjdC5zdXBwb3J0c1RvdWNoXG4gICAgIFsgbWV0aG9kIF1cbiAgICAgKlxuICAgICA9IChib29sZWFuKSBXaGV0aGVyIG9yIG5vdCB0aGUgYnJvd3NlciBzdXBwb3J0cyB0b3VjaCBpbnB1dFxuICAgIFxcKi9cbiAgICBpbnRlcmFjdC5zdXBwb3J0c1RvdWNoID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gc3VwcG9ydHNUb3VjaDtcbiAgICB9O1xuXG4gICAgLypcXFxuICAgICAqIGludGVyYWN0LnN1cHBvcnRzUG9pbnRlckV2ZW50XG4gICAgIFsgbWV0aG9kIF1cbiAgICAgKlxuICAgICA9IChib29sZWFuKSBXaGV0aGVyIG9yIG5vdCB0aGUgYnJvd3NlciBzdXBwb3J0cyBQb2ludGVyRXZlbnRzXG4gICAgXFwqL1xuICAgIGludGVyYWN0LnN1cHBvcnRzUG9pbnRlckV2ZW50ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gc3VwcG9ydHNQb2ludGVyRXZlbnQ7XG4gICAgfTtcblxuICAgIC8qXFxcbiAgICAgKiBpbnRlcmFjdC5zdG9wXG4gICAgIFsgbWV0aG9kIF1cbiAgICAgKlxuICAgICAqIENhbmNlbHMgYWxsIGludGVyYWN0aW9ucyAoZW5kIGV2ZW50cyBhcmUgbm90IGZpcmVkKVxuICAgICAqXG4gICAgIC0gZXZlbnQgKEV2ZW50KSBBbiBldmVudCBvbiB3aGljaCB0byBjYWxsIHByZXZlbnREZWZhdWx0KClcbiAgICAgPSAob2JqZWN0KSBpbnRlcmFjdFxuICAgIFxcKi9cbiAgICBpbnRlcmFjdC5zdG9wID0gZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgIGZvciAodmFyIGkgPSBpbnRlcmFjdGlvbnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgIGludGVyYWN0aW9uc1tpXS5zdG9wKGV2ZW50KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBpbnRlcmFjdDtcbiAgICB9O1xuXG4gICAgLypcXFxuICAgICAqIGludGVyYWN0LmR5bmFtaWNEcm9wXG4gICAgIFsgbWV0aG9kIF1cbiAgICAgKlxuICAgICAqIFJldHVybnMgb3Igc2V0cyB3aGV0aGVyIHRoZSBkaW1lbnNpb25zIG9mIGRyb3B6b25lIGVsZW1lbnRzIGFyZVxuICAgICAqIGNhbGN1bGF0ZWQgb24gZXZlcnkgZHJhZ21vdmUgb3Igb25seSBvbiBkcmFnc3RhcnQgZm9yIHRoZSBkZWZhdWx0XG4gICAgICogZHJvcENoZWNrZXJcbiAgICAgKlxuICAgICAtIG5ld1ZhbHVlIChib29sZWFuKSAjb3B0aW9uYWwgVHJ1ZSB0byBjaGVjayBvbiBlYWNoIG1vdmUuIEZhbHNlIHRvIGNoZWNrIG9ubHkgYmVmb3JlIHN0YXJ0XG4gICAgID0gKGJvb2xlYW4gfCBpbnRlcmFjdCkgVGhlIGN1cnJlbnQgc2V0dGluZyBvciBpbnRlcmFjdFxuICAgIFxcKi9cbiAgICBpbnRlcmFjdC5keW5hbWljRHJvcCA9IGZ1bmN0aW9uIChuZXdWYWx1ZSkge1xuICAgICAgICBpZiAoaXNCb29sKG5ld1ZhbHVlKSkge1xuICAgICAgICAgICAgLy9pZiAoZHJhZ2dpbmcgJiYgZHluYW1pY0Ryb3AgIT09IG5ld1ZhbHVlICYmICFuZXdWYWx1ZSkge1xuICAgICAgICAgICAgICAgIC8vY2FsY1JlY3RzKGRyb3B6b25lcyk7XG4gICAgICAgICAgICAvL31cblxuICAgICAgICAgICAgZHluYW1pY0Ryb3AgPSBuZXdWYWx1ZTtcblxuICAgICAgICAgICAgcmV0dXJuIGludGVyYWN0O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBkeW5hbWljRHJvcDtcbiAgICB9O1xuXG4gICAgLypcXFxuICAgICAqIGludGVyYWN0LnBvaW50ZXJNb3ZlVG9sZXJhbmNlXG4gICAgIFsgbWV0aG9kIF1cbiAgICAgKiBSZXR1cm5zIG9yIHNldHMgdGhlIGRpc3RhbmNlIHRoZSBwb2ludGVyIG11c3QgYmUgbW92ZWQgYmVmb3JlIGFuIGFjdGlvblxuICAgICAqIHNlcXVlbmNlIG9jY3Vycy4gVGhpcyBhbHNvIGFmZmVjdHMgdG9sZXJhbmNlIGZvciB0YXAgZXZlbnRzLlxuICAgICAqXG4gICAgIC0gbmV3VmFsdWUgKG51bWJlcikgI29wdGlvbmFsIFRoZSBtb3ZlbWVudCBmcm9tIHRoZSBzdGFydCBwb3NpdGlvbiBtdXN0IGJlIGdyZWF0ZXIgdGhhbiB0aGlzIHZhbHVlXG4gICAgID0gKG51bWJlciB8IEludGVyYWN0YWJsZSkgVGhlIGN1cnJlbnQgc2V0dGluZyBvciBpbnRlcmFjdFxuICAgIFxcKi9cbiAgICBpbnRlcmFjdC5wb2ludGVyTW92ZVRvbGVyYW5jZSA9IGZ1bmN0aW9uIChuZXdWYWx1ZSkge1xuICAgICAgICBpZiAoaXNOdW1iZXIobmV3VmFsdWUpKSB7XG4gICAgICAgICAgICBwb2ludGVyTW92ZVRvbGVyYW5jZSA9IG5ld1ZhbHVlO1xuXG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBwb2ludGVyTW92ZVRvbGVyYW5jZTtcbiAgICB9O1xuXG4gICAgLypcXFxuICAgICAqIGludGVyYWN0Lm1heEludGVyYWN0aW9uc1xuICAgICBbIG1ldGhvZCBdXG4gICAgICoqXG4gICAgICogUmV0dXJucyBvciBzZXRzIHRoZSBtYXhpbXVtIG51bWJlciBvZiBjb25jdXJyZW50IGludGVyYWN0aW9ucyBhbGxvd2VkLlxuICAgICAqIEJ5IGRlZmF1bHQgb25seSAxIGludGVyYWN0aW9uIGlzIGFsbG93ZWQgYXQgYSB0aW1lIChmb3IgYmFja3dhcmRzXG4gICAgICogY29tcGF0aWJpbGl0eSkuIFRvIGFsbG93IG11bHRpcGxlIGludGVyYWN0aW9ucyBvbiB0aGUgc2FtZSBJbnRlcmFjdGFibGVzXG4gICAgICogYW5kIGVsZW1lbnRzLCB5b3UgbmVlZCB0byBlbmFibGUgaXQgaW4gdGhlIGRyYWdnYWJsZSwgcmVzaXphYmxlIGFuZFxuICAgICAqIGdlc3R1cmFibGUgYCdtYXgnYCBhbmQgYCdtYXhQZXJFbGVtZW50J2Agb3B0aW9ucy5cbiAgICAgKipcbiAgICAgLSBuZXdWYWx1ZSAobnVtYmVyKSAjb3B0aW9uYWwgQW55IG51bWJlci4gbmV3VmFsdWUgPD0gMCBtZWFucyBubyBpbnRlcmFjdGlvbnMuXG4gICAgXFwqL1xuICAgIGludGVyYWN0Lm1heEludGVyYWN0aW9ucyA9IGZ1bmN0aW9uIChuZXdWYWx1ZSkge1xuICAgICAgICBpZiAoaXNOdW1iZXIobmV3VmFsdWUpKSB7XG4gICAgICAgICAgICBtYXhJbnRlcmFjdGlvbnMgPSBuZXdWYWx1ZTtcblxuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbWF4SW50ZXJhY3Rpb25zO1xuICAgIH07XG5cbiAgICBpbnRlcmFjdC5jcmVhdGVTbmFwR3JpZCA9IGZ1bmN0aW9uIChncmlkKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoeCwgeSkge1xuICAgICAgICAgICAgdmFyIG9mZnNldFggPSAwLFxuICAgICAgICAgICAgICAgIG9mZnNldFkgPSAwO1xuXG4gICAgICAgICAgICBpZiAoaXNPYmplY3QoZ3JpZC5vZmZzZXQpKSB7XG4gICAgICAgICAgICAgICAgb2Zmc2V0WCA9IGdyaWQub2Zmc2V0Lng7XG4gICAgICAgICAgICAgICAgb2Zmc2V0WSA9IGdyaWQub2Zmc2V0Lnk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBncmlkeCA9IE1hdGgucm91bmQoKHggLSBvZmZzZXRYKSAvIGdyaWQueCksXG4gICAgICAgICAgICAgICAgZ3JpZHkgPSBNYXRoLnJvdW5kKCh5IC0gb2Zmc2V0WSkgLyBncmlkLnkpLFxuXG4gICAgICAgICAgICAgICAgbmV3WCA9IGdyaWR4ICogZ3JpZC54ICsgb2Zmc2V0WCxcbiAgICAgICAgICAgICAgICBuZXdZID0gZ3JpZHkgKiBncmlkLnkgKyBvZmZzZXRZO1xuXG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHg6IG5ld1gsXG4gICAgICAgICAgICAgICAgeTogbmV3WSxcbiAgICAgICAgICAgICAgICByYW5nZTogZ3JpZC5yYW5nZVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfTtcbiAgICB9O1xuXG4gICAgZnVuY3Rpb24gZW5kQWxsSW50ZXJhY3Rpb25zIChldmVudCkge1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGludGVyYWN0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaW50ZXJhY3Rpb25zW2ldLnBvaW50ZXJFbmQoZXZlbnQsIGV2ZW50KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpc3RlblRvRG9jdW1lbnQgKGRvYykge1xuICAgICAgICBpZiAoY29udGFpbnMoZG9jdW1lbnRzLCBkb2MpKSB7IHJldHVybjsgfVxuXG4gICAgICAgIHZhciB3aW4gPSBkb2MuZGVmYXVsdFZpZXcgfHwgZG9jLnBhcmVudFdpbmRvdztcblxuICAgICAgICAvLyBhZGQgZGVsZWdhdGUgZXZlbnQgbGlzdGVuZXJcbiAgICAgICAgZm9yICh2YXIgZXZlbnRUeXBlIGluIGRlbGVnYXRlZEV2ZW50cykge1xuICAgICAgICAgICAgZXZlbnRzLmFkZChkb2MsIGV2ZW50VHlwZSwgZGVsZWdhdGVMaXN0ZW5lcik7XG4gICAgICAgICAgICBldmVudHMuYWRkKGRvYywgZXZlbnRUeXBlLCBkZWxlZ2F0ZVVzZUNhcHR1cmUsIHRydWUpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKFBvaW50ZXJFdmVudCkge1xuICAgICAgICAgICAgaWYgKFBvaW50ZXJFdmVudCA9PT0gd2luLk1TUG9pbnRlckV2ZW50KSB7XG4gICAgICAgICAgICAgICAgcEV2ZW50VHlwZXMgPSB7XG4gICAgICAgICAgICAgICAgICAgIHVwOiAnTVNQb2ludGVyVXAnLCBkb3duOiAnTVNQb2ludGVyRG93bicsIG92ZXI6ICdtb3VzZW92ZXInLFxuICAgICAgICAgICAgICAgICAgICBvdXQ6ICdtb3VzZW91dCcsIG1vdmU6ICdNU1BvaW50ZXJNb3ZlJywgY2FuY2VsOiAnTVNQb2ludGVyQ2FuY2VsJyB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcEV2ZW50VHlwZXMgPSB7XG4gICAgICAgICAgICAgICAgICAgIHVwOiAncG9pbnRlcnVwJywgZG93bjogJ3BvaW50ZXJkb3duJywgb3ZlcjogJ3BvaW50ZXJvdmVyJyxcbiAgICAgICAgICAgICAgICAgICAgb3V0OiAncG9pbnRlcm91dCcsIG1vdmU6ICdwb2ludGVybW92ZScsIGNhbmNlbDogJ3BvaW50ZXJjYW5jZWwnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGV2ZW50cy5hZGQoZG9jLCBwRXZlbnRUeXBlcy5kb3duICAsIGxpc3RlbmVycy5zZWxlY3RvckRvd24gKTtcbiAgICAgICAgICAgIGV2ZW50cy5hZGQoZG9jLCBwRXZlbnRUeXBlcy5tb3ZlICAsIGxpc3RlbmVycy5wb2ludGVyTW92ZSAgKTtcbiAgICAgICAgICAgIGV2ZW50cy5hZGQoZG9jLCBwRXZlbnRUeXBlcy5vdmVyICAsIGxpc3RlbmVycy5wb2ludGVyT3ZlciAgKTtcbiAgICAgICAgICAgIGV2ZW50cy5hZGQoZG9jLCBwRXZlbnRUeXBlcy5vdXQgICAsIGxpc3RlbmVycy5wb2ludGVyT3V0ICAgKTtcbiAgICAgICAgICAgIGV2ZW50cy5hZGQoZG9jLCBwRXZlbnRUeXBlcy51cCAgICAsIGxpc3RlbmVycy5wb2ludGVyVXAgICAgKTtcbiAgICAgICAgICAgIGV2ZW50cy5hZGQoZG9jLCBwRXZlbnRUeXBlcy5jYW5jZWwsIGxpc3RlbmVycy5wb2ludGVyQ2FuY2VsKTtcblxuICAgICAgICAgICAgLy8gYXV0b3Njcm9sbFxuICAgICAgICAgICAgZXZlbnRzLmFkZChkb2MsIHBFdmVudFR5cGVzLm1vdmUsIGxpc3RlbmVycy5hdXRvU2Nyb2xsTW92ZSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBldmVudHMuYWRkKGRvYywgJ21vdXNlZG93bicsIGxpc3RlbmVycy5zZWxlY3RvckRvd24pO1xuICAgICAgICAgICAgZXZlbnRzLmFkZChkb2MsICdtb3VzZW1vdmUnLCBsaXN0ZW5lcnMucG9pbnRlck1vdmUgKTtcbiAgICAgICAgICAgIGV2ZW50cy5hZGQoZG9jLCAnbW91c2V1cCcgICwgbGlzdGVuZXJzLnBvaW50ZXJVcCAgICk7XG4gICAgICAgICAgICBldmVudHMuYWRkKGRvYywgJ21vdXNlb3ZlcicsIGxpc3RlbmVycy5wb2ludGVyT3ZlciApO1xuICAgICAgICAgICAgZXZlbnRzLmFkZChkb2MsICdtb3VzZW91dCcgLCBsaXN0ZW5lcnMucG9pbnRlck91dCAgKTtcblxuICAgICAgICAgICAgZXZlbnRzLmFkZChkb2MsICd0b3VjaHN0YXJ0JyAsIGxpc3RlbmVycy5zZWxlY3RvckRvd24gKTtcbiAgICAgICAgICAgIGV2ZW50cy5hZGQoZG9jLCAndG91Y2htb3ZlJyAgLCBsaXN0ZW5lcnMucG9pbnRlck1vdmUgICk7XG4gICAgICAgICAgICBldmVudHMuYWRkKGRvYywgJ3RvdWNoZW5kJyAgICwgbGlzdGVuZXJzLnBvaW50ZXJVcCAgICApO1xuICAgICAgICAgICAgZXZlbnRzLmFkZChkb2MsICd0b3VjaGNhbmNlbCcsIGxpc3RlbmVycy5wb2ludGVyQ2FuY2VsKTtcblxuICAgICAgICAgICAgLy8gYXV0b3Njcm9sbFxuICAgICAgICAgICAgZXZlbnRzLmFkZChkb2MsICdtb3VzZW1vdmUnLCBsaXN0ZW5lcnMuYXV0b1Njcm9sbE1vdmUpO1xuICAgICAgICAgICAgZXZlbnRzLmFkZChkb2MsICd0b3VjaG1vdmUnLCBsaXN0ZW5lcnMuYXV0b1Njcm9sbE1vdmUpO1xuICAgICAgICB9XG5cbiAgICAgICAgZXZlbnRzLmFkZCh3aW4sICdibHVyJywgZW5kQWxsSW50ZXJhY3Rpb25zKTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKHdpbi5mcmFtZUVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICB2YXIgcGFyZW50RG9jID0gd2luLmZyYW1lRWxlbWVudC5vd25lckRvY3VtZW50LFxuICAgICAgICAgICAgICAgICAgICBwYXJlbnRXaW5kb3cgPSBwYXJlbnREb2MuZGVmYXVsdFZpZXc7XG5cbiAgICAgICAgICAgICAgICBldmVudHMuYWRkKHBhcmVudERvYyAgICwgJ21vdXNldXAnICAgICAgLCBsaXN0ZW5lcnMucG9pbnRlckVuZCk7XG4gICAgICAgICAgICAgICAgZXZlbnRzLmFkZChwYXJlbnREb2MgICAsICd0b3VjaGVuZCcgICAgICwgbGlzdGVuZXJzLnBvaW50ZXJFbmQpO1xuICAgICAgICAgICAgICAgIGV2ZW50cy5hZGQocGFyZW50RG9jICAgLCAndG91Y2hjYW5jZWwnICAsIGxpc3RlbmVycy5wb2ludGVyRW5kKTtcbiAgICAgICAgICAgICAgICBldmVudHMuYWRkKHBhcmVudERvYyAgICwgJ3BvaW50ZXJ1cCcgICAgLCBsaXN0ZW5lcnMucG9pbnRlckVuZCk7XG4gICAgICAgICAgICAgICAgZXZlbnRzLmFkZChwYXJlbnREb2MgICAsICdNU1BvaW50ZXJVcCcgICwgbGlzdGVuZXJzLnBvaW50ZXJFbmQpO1xuICAgICAgICAgICAgICAgIGV2ZW50cy5hZGQocGFyZW50V2luZG93LCAnYmx1cicgICAgICAgICAsIGVuZEFsbEludGVyYWN0aW9ucyApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgaW50ZXJhY3Qud2luZG93UGFyZW50RXJyb3IgPSBlcnJvcjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHByZXZlbnQgbmF0aXZlIEhUTUw1IGRyYWcgb24gaW50ZXJhY3QuanMgdGFyZ2V0IGVsZW1lbnRzXG4gICAgICAgIGV2ZW50cy5hZGQoZG9jLCAnZHJhZ3N0YXJ0JywgZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGludGVyYWN0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIHZhciBpbnRlcmFjdGlvbiA9IGludGVyYWN0aW9uc1tpXTtcblxuICAgICAgICAgICAgICAgIGlmIChpbnRlcmFjdGlvbi5lbGVtZW50XG4gICAgICAgICAgICAgICAgICAgICYmIChpbnRlcmFjdGlvbi5lbGVtZW50ID09PSBldmVudC50YXJnZXRcbiAgICAgICAgICAgICAgICAgICAgICAgIHx8IG5vZGVDb250YWlucyhpbnRlcmFjdGlvbi5lbGVtZW50LCBldmVudC50YXJnZXQpKSkge1xuXG4gICAgICAgICAgICAgICAgICAgIGludGVyYWN0aW9uLmNoZWNrQW5kUHJldmVudERlZmF1bHQoZXZlbnQsIGludGVyYWN0aW9uLnRhcmdldCwgaW50ZXJhY3Rpb24uZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChldmVudHMudXNlQXR0YWNoRXZlbnQpIHtcbiAgICAgICAgICAgIC8vIEZvciBJRSdzIGxhY2sgb2YgRXZlbnQjcHJldmVudERlZmF1bHRcbiAgICAgICAgICAgIGV2ZW50cy5hZGQoZG9jLCAnc2VsZWN0c3RhcnQnLCBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgICAgICB2YXIgaW50ZXJhY3Rpb24gPSBpbnRlcmFjdGlvbnNbMF07XG5cbiAgICAgICAgICAgICAgICBpZiAoaW50ZXJhY3Rpb24uY3VycmVudEFjdGlvbigpKSB7XG4gICAgICAgICAgICAgICAgICAgIGludGVyYWN0aW9uLmNoZWNrQW5kUHJldmVudERlZmF1bHQoZXZlbnQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBGb3IgSUUncyBiYWQgZGJsY2xpY2sgZXZlbnQgc2VxdWVuY2VcbiAgICAgICAgICAgIGV2ZW50cy5hZGQoZG9jLCAnZGJsY2xpY2snLCBkb09uSW50ZXJhY3Rpb25zKCdpZThEYmxjbGljaycpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGRvY3VtZW50cy5wdXNoKGRvYyk7XG4gICAgfVxuXG4gICAgbGlzdGVuVG9Eb2N1bWVudChkb2N1bWVudCk7XG5cbiAgICBmdW5jdGlvbiBpbmRleE9mIChhcnJheSwgdGFyZ2V0KSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBhcnJheS5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgICAgaWYgKGFycmF5W2ldID09PSB0YXJnZXQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gaTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiAtMTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjb250YWlucyAoYXJyYXksIHRhcmdldCkge1xuICAgICAgICByZXR1cm4gaW5kZXhPZihhcnJheSwgdGFyZ2V0KSAhPT0gLTE7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbWF0Y2hlc1NlbGVjdG9yIChlbGVtZW50LCBzZWxlY3Rvciwgbm9kZUxpc3QpIHtcbiAgICAgICAgaWYgKGllOE1hdGNoZXNTZWxlY3Rvcikge1xuICAgICAgICAgICAgcmV0dXJuIGllOE1hdGNoZXNTZWxlY3RvcihlbGVtZW50LCBzZWxlY3Rvciwgbm9kZUxpc3QpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gcmVtb3ZlIC9kZWVwLyBmcm9tIHNlbGVjdG9ycyBpZiBzaGFkb3dET00gcG9seWZpbGwgaXMgdXNlZFxuICAgICAgICBpZiAod2luZG93ICE9PSByZWFsV2luZG93KSB7XG4gICAgICAgICAgICBzZWxlY3RvciA9IHNlbGVjdG9yLnJlcGxhY2UoL1xcL2RlZXBcXC8vZywgJyAnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBlbGVtZW50W3ByZWZpeGVkTWF0Y2hlc1NlbGVjdG9yXShzZWxlY3Rvcik7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbWF0Y2hlc1VwVG8gKGVsZW1lbnQsIHNlbGVjdG9yLCBsaW1pdCkge1xuICAgICAgICB3aGlsZSAoaXNFbGVtZW50KGVsZW1lbnQpKSB7XG4gICAgICAgICAgICBpZiAobWF0Y2hlc1NlbGVjdG9yKGVsZW1lbnQsIHNlbGVjdG9yKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBlbGVtZW50ID0gcGFyZW50RWxlbWVudChlbGVtZW50KTtcblxuICAgICAgICAgICAgaWYgKGVsZW1lbnQgPT09IGxpbWl0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG1hdGNoZXNTZWxlY3RvcihlbGVtZW50LCBzZWxlY3Rvcik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgLy8gRm9yIElFOCdzIGxhY2sgb2YgYW4gRWxlbWVudCNtYXRjaGVzU2VsZWN0b3JcbiAgICAvLyB0YWtlbiBmcm9tIGh0dHA6Ly90YW5hbGluLmNvbS9lbi9ibG9nLzIwMTIvMTIvbWF0Y2hlcy1zZWxlY3Rvci1pZTgvIGFuZCBtb2RpZmllZFxuICAgIGlmICghKHByZWZpeGVkTWF0Y2hlc1NlbGVjdG9yIGluIEVsZW1lbnQucHJvdG90eXBlKSB8fCAhaXNGdW5jdGlvbihFbGVtZW50LnByb3RvdHlwZVtwcmVmaXhlZE1hdGNoZXNTZWxlY3Rvcl0pKSB7XG4gICAgICAgIGllOE1hdGNoZXNTZWxlY3RvciA9IGZ1bmN0aW9uIChlbGVtZW50LCBzZWxlY3RvciwgZWxlbXMpIHtcbiAgICAgICAgICAgIGVsZW1zID0gZWxlbXMgfHwgZWxlbWVudC5wYXJlbnROb2RlLnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpO1xuXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gZWxlbXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgICAgICBpZiAoZWxlbXNbaV0gPT09IGVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gcmVxdWVzdEFuaW1hdGlvbkZyYW1lIHBvbHlmaWxsXG4gICAgKGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgbGFzdFRpbWUgPSAwLFxuICAgICAgICAgICAgdmVuZG9ycyA9IFsnbXMnLCAnbW96JywgJ3dlYmtpdCcsICdvJ107XG5cbiAgICAgICAgZm9yKHZhciB4ID0gMDsgeCA8IHZlbmRvcnMubGVuZ3RoICYmICFyZWFsV2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZTsgKyt4KSB7XG4gICAgICAgICAgICByZXFGcmFtZSA9IHJlYWxXaW5kb3dbdmVuZG9yc1t4XSsnUmVxdWVzdEFuaW1hdGlvbkZyYW1lJ107XG4gICAgICAgICAgICBjYW5jZWxGcmFtZSA9IHJlYWxXaW5kb3dbdmVuZG9yc1t4XSsnQ2FuY2VsQW5pbWF0aW9uRnJhbWUnXSB8fCByZWFsV2luZG93W3ZlbmRvcnNbeF0rJ0NhbmNlbFJlcXVlc3RBbmltYXRpb25GcmFtZSddO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFyZXFGcmFtZSkge1xuICAgICAgICAgICAgcmVxRnJhbWUgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgIHZhciBjdXJyVGltZSA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpLFxuICAgICAgICAgICAgICAgICAgICB0aW1lVG9DYWxsID0gTWF0aC5tYXgoMCwgMTYgLSAoY3VyclRpbWUgLSBsYXN0VGltZSkpLFxuICAgICAgICAgICAgICAgICAgICBpZCA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7IGNhbGxiYWNrKGN1cnJUaW1lICsgdGltZVRvQ2FsbCk7IH0sXG4gICAgICAgICAgICAgICAgICB0aW1lVG9DYWxsKTtcbiAgICAgICAgICAgICAgICBsYXN0VGltZSA9IGN1cnJUaW1lICsgdGltZVRvQ2FsbDtcbiAgICAgICAgICAgICAgICByZXR1cm4gaWQ7XG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFjYW5jZWxGcmFtZSkge1xuICAgICAgICAgICAgY2FuY2VsRnJhbWUgPSBmdW5jdGlvbihpZCkge1xuICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dChpZCk7XG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgfSgpKTtcblxuICAgIC8qIGdsb2JhbCBleHBvcnRzOiB0cnVlLCBtb2R1bGUsIGRlZmluZSAqL1xuXG4gICAgLy8gaHR0cDovL2RvY3VtZW50Y2xvdWQuZ2l0aHViLmlvL3VuZGVyc2NvcmUvZG9jcy91bmRlcnNjb3JlLmh0bWwjc2VjdGlvbi0xMVxuICAgIGlmICh0eXBlb2YgZXhwb3J0cyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnICYmIG1vZHVsZS5leHBvcnRzKSB7XG4gICAgICAgICAgICBleHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBpbnRlcmFjdDtcbiAgICAgICAgfVxuICAgICAgICBleHBvcnRzLmludGVyYWN0ID0gaW50ZXJhY3Q7XG4gICAgfVxuICAgIC8vIEFNRFxuICAgIGVsc2UgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xuICAgICAgICBkZWZpbmUoJ2ludGVyYWN0JywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gaW50ZXJhY3Q7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcmVhbFdpbmRvdy5pbnRlcmFjdCA9IGludGVyYWN0O1xuICAgIH1cblxufSAodHlwZW9mIHdpbmRvdyA9PT0gJ3VuZGVmaW5lZCc/IHVuZGVmaW5lZCA6IHdpbmRvdykpO1xuIiwidmFyIGlzT2JqZWN0ID0gcmVxdWlyZSgnLi9pc09iamVjdCcpLFxuICAgIG5vdyA9IHJlcXVpcmUoJy4vbm93JyksXG4gICAgdG9OdW1iZXIgPSByZXF1aXJlKCcuL3RvTnVtYmVyJyk7XG5cbi8qKiBVc2VkIGFzIHRoZSBgVHlwZUVycm9yYCBtZXNzYWdlIGZvciBcIkZ1bmN0aW9uc1wiIG1ldGhvZHMuICovXG52YXIgRlVOQ19FUlJPUl9URVhUID0gJ0V4cGVjdGVkIGEgZnVuY3Rpb24nO1xuXG4vKiBCdWlsdC1pbiBtZXRob2QgcmVmZXJlbmNlcyBmb3IgdGhvc2Ugd2l0aCB0aGUgc2FtZSBuYW1lIGFzIG90aGVyIGBsb2Rhc2hgIG1ldGhvZHMuICovXG52YXIgbmF0aXZlTWF4ID0gTWF0aC5tYXg7XG5cbi8qKlxuICogQ3JlYXRlcyBhIGRlYm91bmNlZCBmdW5jdGlvbiB0aGF0IGRlbGF5cyBpbnZva2luZyBgZnVuY2AgdW50aWwgYWZ0ZXIgYHdhaXRgXG4gKiBtaWxsaXNlY29uZHMgaGF2ZSBlbGFwc2VkIHNpbmNlIHRoZSBsYXN0IHRpbWUgdGhlIGRlYm91bmNlZCBmdW5jdGlvbiB3YXNcbiAqIGludm9rZWQuIFRoZSBkZWJvdW5jZWQgZnVuY3Rpb24gY29tZXMgd2l0aCBhIGBjYW5jZWxgIG1ldGhvZCB0byBjYW5jZWxcbiAqIGRlbGF5ZWQgYGZ1bmNgIGludm9jYXRpb25zIGFuZCBhIGBmbHVzaGAgbWV0aG9kIHRvIGltbWVkaWF0ZWx5IGludm9rZSB0aGVtLlxuICogUHJvdmlkZSBhbiBvcHRpb25zIG9iamVjdCB0byBpbmRpY2F0ZSB3aGV0aGVyIGBmdW5jYCBzaG91bGQgYmUgaW52b2tlZCBvblxuICogdGhlIGxlYWRpbmcgYW5kL29yIHRyYWlsaW5nIGVkZ2Ugb2YgdGhlIGB3YWl0YCB0aW1lb3V0LiBUaGUgYGZ1bmNgIGlzIGludm9rZWRcbiAqIHdpdGggdGhlIGxhc3QgYXJndW1lbnRzIHByb3ZpZGVkIHRvIHRoZSBkZWJvdW5jZWQgZnVuY3Rpb24uIFN1YnNlcXVlbnQgY2FsbHNcbiAqIHRvIHRoZSBkZWJvdW5jZWQgZnVuY3Rpb24gcmV0dXJuIHRoZSByZXN1bHQgb2YgdGhlIGxhc3QgYGZ1bmNgIGludm9jYXRpb24uXG4gKlxuICogKipOb3RlOioqIElmIGBsZWFkaW5nYCBhbmQgYHRyYWlsaW5nYCBvcHRpb25zIGFyZSBgdHJ1ZWAsIGBmdW5jYCBpcyBpbnZva2VkXG4gKiBvbiB0aGUgdHJhaWxpbmcgZWRnZSBvZiB0aGUgdGltZW91dCBvbmx5IGlmIHRoZSBkZWJvdW5jZWQgZnVuY3Rpb24gaXNcbiAqIGludm9rZWQgbW9yZSB0aGFuIG9uY2UgZHVyaW5nIHRoZSBgd2FpdGAgdGltZW91dC5cbiAqXG4gKiBTZWUgW0RhdmlkIENvcmJhY2hvJ3MgYXJ0aWNsZV0oaHR0cDovL2RydXBhbG1vdGlvbi5jb20vYXJ0aWNsZS9kZWJvdW5jZS1hbmQtdGhyb3R0bGUtdmlzdWFsLWV4cGxhbmF0aW9uKVxuICogZm9yIGRldGFpbHMgb3ZlciB0aGUgZGlmZmVyZW5jZXMgYmV0d2VlbiBgXy5kZWJvdW5jZWAgYW5kIGBfLnRocm90dGxlYC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IEZ1bmN0aW9uXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBkZWJvdW5jZS5cbiAqIEBwYXJhbSB7bnVtYmVyfSBbd2FpdD0wXSBUaGUgbnVtYmVyIG9mIG1pbGxpc2Vjb25kcyB0byBkZWxheS5cbiAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gVGhlIG9wdGlvbnMgb2JqZWN0LlxuICogQHBhcmFtIHtib29sZWFufSBbb3B0aW9ucy5sZWFkaW5nPWZhbHNlXSBTcGVjaWZ5IGludm9raW5nIG9uIHRoZSBsZWFkaW5nXG4gKiAgZWRnZSBvZiB0aGUgdGltZW91dC5cbiAqIEBwYXJhbSB7bnVtYmVyfSBbb3B0aW9ucy5tYXhXYWl0XSBUaGUgbWF4aW11bSB0aW1lIGBmdW5jYCBpcyBhbGxvd2VkIHRvIGJlXG4gKiAgZGVsYXllZCBiZWZvcmUgaXQncyBpbnZva2VkLlxuICogQHBhcmFtIHtib29sZWFufSBbb3B0aW9ucy50cmFpbGluZz10cnVlXSBTcGVjaWZ5IGludm9raW5nIG9uIHRoZSB0cmFpbGluZ1xuICogIGVkZ2Ugb2YgdGhlIHRpbWVvdXQuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IFJldHVybnMgdGhlIG5ldyBkZWJvdW5jZWQgZnVuY3Rpb24uXG4gKiBAZXhhbXBsZVxuICpcbiAqIC8vIEF2b2lkIGNvc3RseSBjYWxjdWxhdGlvbnMgd2hpbGUgdGhlIHdpbmRvdyBzaXplIGlzIGluIGZsdXguXG4gKiBqUXVlcnkod2luZG93KS5vbigncmVzaXplJywgXy5kZWJvdW5jZShjYWxjdWxhdGVMYXlvdXQsIDE1MCkpO1xuICpcbiAqIC8vIEludm9rZSBgc2VuZE1haWxgIHdoZW4gY2xpY2tlZCwgZGVib3VuY2luZyBzdWJzZXF1ZW50IGNhbGxzLlxuICogalF1ZXJ5KGVsZW1lbnQpLm9uKCdjbGljaycsIF8uZGVib3VuY2Uoc2VuZE1haWwsIDMwMCwge1xuICogICAnbGVhZGluZyc6IHRydWUsXG4gKiAgICd0cmFpbGluZyc6IGZhbHNlXG4gKiB9KSk7XG4gKlxuICogLy8gRW5zdXJlIGBiYXRjaExvZ2AgaXMgaW52b2tlZCBvbmNlIGFmdGVyIDEgc2Vjb25kIG9mIGRlYm91bmNlZCBjYWxscy5cbiAqIHZhciBkZWJvdW5jZWQgPSBfLmRlYm91bmNlKGJhdGNoTG9nLCAyNTAsIHsgJ21heFdhaXQnOiAxMDAwIH0pO1xuICogdmFyIHNvdXJjZSA9IG5ldyBFdmVudFNvdXJjZSgnL3N0cmVhbScpO1xuICogalF1ZXJ5KHNvdXJjZSkub24oJ21lc3NhZ2UnLCBkZWJvdW5jZWQpO1xuICpcbiAqIC8vIENhbmNlbCB0aGUgdHJhaWxpbmcgZGVib3VuY2VkIGludm9jYXRpb24uXG4gKiBqUXVlcnkod2luZG93KS5vbigncG9wc3RhdGUnLCBkZWJvdW5jZWQuY2FuY2VsKTtcbiAqL1xuZnVuY3Rpb24gZGVib3VuY2UoZnVuYywgd2FpdCwgb3B0aW9ucykge1xuICB2YXIgYXJncyxcbiAgICAgIG1heFRpbWVvdXRJZCxcbiAgICAgIHJlc3VsdCxcbiAgICAgIHN0YW1wLFxuICAgICAgdGhpc0FyZyxcbiAgICAgIHRpbWVvdXRJZCxcbiAgICAgIHRyYWlsaW5nQ2FsbCxcbiAgICAgIGxhc3RDYWxsZWQgPSAwLFxuICAgICAgbGVhZGluZyA9IGZhbHNlLFxuICAgICAgbWF4V2FpdCA9IGZhbHNlLFxuICAgICAgdHJhaWxpbmcgPSB0cnVlO1xuXG4gIGlmICh0eXBlb2YgZnVuYyAhPSAnZnVuY3Rpb24nKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihGVU5DX0VSUk9SX1RFWFQpO1xuICB9XG4gIHdhaXQgPSB0b051bWJlcih3YWl0KSB8fCAwO1xuICBpZiAoaXNPYmplY3Qob3B0aW9ucykpIHtcbiAgICBsZWFkaW5nID0gISFvcHRpb25zLmxlYWRpbmc7XG4gICAgbWF4V2FpdCA9ICdtYXhXYWl0JyBpbiBvcHRpb25zICYmIG5hdGl2ZU1heCh0b051bWJlcihvcHRpb25zLm1heFdhaXQpIHx8IDAsIHdhaXQpO1xuICAgIHRyYWlsaW5nID0gJ3RyYWlsaW5nJyBpbiBvcHRpb25zID8gISFvcHRpb25zLnRyYWlsaW5nIDogdHJhaWxpbmc7XG4gIH1cblxuICBmdW5jdGlvbiBjYW5jZWwoKSB7XG4gICAgaWYgKHRpbWVvdXRJZCkge1xuICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XG4gICAgfVxuICAgIGlmIChtYXhUaW1lb3V0SWQpIHtcbiAgICAgIGNsZWFyVGltZW91dChtYXhUaW1lb3V0SWQpO1xuICAgIH1cbiAgICBsYXN0Q2FsbGVkID0gMDtcbiAgICBhcmdzID0gbWF4VGltZW91dElkID0gdGhpc0FyZyA9IHRpbWVvdXRJZCA9IHRyYWlsaW5nQ2FsbCA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbXBsZXRlKGlzQ2FsbGVkLCBpZCkge1xuICAgIGlmIChpZCkge1xuICAgICAgY2xlYXJUaW1lb3V0KGlkKTtcbiAgICB9XG4gICAgbWF4VGltZW91dElkID0gdGltZW91dElkID0gdHJhaWxpbmdDYWxsID0gdW5kZWZpbmVkO1xuICAgIGlmIChpc0NhbGxlZCkge1xuICAgICAgbGFzdENhbGxlZCA9IG5vdygpO1xuICAgICAgcmVzdWx0ID0gZnVuYy5hcHBseSh0aGlzQXJnLCBhcmdzKTtcbiAgICAgIGlmICghdGltZW91dElkICYmICFtYXhUaW1lb3V0SWQpIHtcbiAgICAgICAgYXJncyA9IHRoaXNBcmcgPSB1bmRlZmluZWQ7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZGVsYXllZCgpIHtcbiAgICB2YXIgcmVtYWluaW5nID0gd2FpdCAtIChub3coKSAtIHN0YW1wKTtcbiAgICBpZiAocmVtYWluaW5nIDw9IDAgfHwgcmVtYWluaW5nID4gd2FpdCkge1xuICAgICAgY29tcGxldGUodHJhaWxpbmdDYWxsLCBtYXhUaW1lb3V0SWQpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aW1lb3V0SWQgPSBzZXRUaW1lb3V0KGRlbGF5ZWQsIHJlbWFpbmluZyk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZmx1c2goKSB7XG4gICAgaWYgKCh0aW1lb3V0SWQgJiYgdHJhaWxpbmdDYWxsKSB8fCAobWF4VGltZW91dElkICYmIHRyYWlsaW5nKSkge1xuICAgICAgcmVzdWx0ID0gZnVuYy5hcHBseSh0aGlzQXJnLCBhcmdzKTtcbiAgICB9XG4gICAgY2FuY2VsKCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGZ1bmN0aW9uIG1heERlbGF5ZWQoKSB7XG4gICAgY29tcGxldGUodHJhaWxpbmcsIHRpbWVvdXRJZCk7XG4gIH1cblxuICBmdW5jdGlvbiBkZWJvdW5jZWQoKSB7XG4gICAgYXJncyA9IGFyZ3VtZW50cztcbiAgICBzdGFtcCA9IG5vdygpO1xuICAgIHRoaXNBcmcgPSB0aGlzO1xuICAgIHRyYWlsaW5nQ2FsbCA9IHRyYWlsaW5nICYmICh0aW1lb3V0SWQgfHwgIWxlYWRpbmcpO1xuXG4gICAgaWYgKG1heFdhaXQgPT09IGZhbHNlKSB7XG4gICAgICB2YXIgbGVhZGluZ0NhbGwgPSBsZWFkaW5nICYmICF0aW1lb3V0SWQ7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmICghbGFzdENhbGxlZCAmJiAhbWF4VGltZW91dElkICYmICFsZWFkaW5nKSB7XG4gICAgICAgIGxhc3RDYWxsZWQgPSBzdGFtcDtcbiAgICAgIH1cbiAgICAgIHZhciByZW1haW5pbmcgPSBtYXhXYWl0IC0gKHN0YW1wIC0gbGFzdENhbGxlZCk7XG5cbiAgICAgIHZhciBpc0NhbGxlZCA9IChyZW1haW5pbmcgPD0gMCB8fCByZW1haW5pbmcgPiBtYXhXYWl0KSAmJlxuICAgICAgICAobGVhZGluZyB8fCBtYXhUaW1lb3V0SWQpO1xuXG4gICAgICBpZiAoaXNDYWxsZWQpIHtcbiAgICAgICAgaWYgKG1heFRpbWVvdXRJZCkge1xuICAgICAgICAgIG1heFRpbWVvdXRJZCA9IGNsZWFyVGltZW91dChtYXhUaW1lb3V0SWQpO1xuICAgICAgICB9XG4gICAgICAgIGxhc3RDYWxsZWQgPSBzdGFtcDtcbiAgICAgICAgcmVzdWx0ID0gZnVuYy5hcHBseSh0aGlzQXJnLCBhcmdzKTtcbiAgICAgIH1cbiAgICAgIGVsc2UgaWYgKCFtYXhUaW1lb3V0SWQpIHtcbiAgICAgICAgbWF4VGltZW91dElkID0gc2V0VGltZW91dChtYXhEZWxheWVkLCByZW1haW5pbmcpO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoaXNDYWxsZWQgJiYgdGltZW91dElkKSB7XG4gICAgICB0aW1lb3V0SWQgPSBjbGVhclRpbWVvdXQodGltZW91dElkKTtcbiAgICB9XG4gICAgZWxzZSBpZiAoIXRpbWVvdXRJZCAmJiB3YWl0ICE9PSBtYXhXYWl0KSB7XG4gICAgICB0aW1lb3V0SWQgPSBzZXRUaW1lb3V0KGRlbGF5ZWQsIHdhaXQpO1xuICAgIH1cbiAgICBpZiAobGVhZGluZ0NhbGwpIHtcbiAgICAgIGlzQ2FsbGVkID0gdHJ1ZTtcbiAgICAgIHJlc3VsdCA9IGZ1bmMuYXBwbHkodGhpc0FyZywgYXJncyk7XG4gICAgfVxuICAgIGlmIChpc0NhbGxlZCAmJiAhdGltZW91dElkICYmICFtYXhUaW1lb3V0SWQpIHtcbiAgICAgIGFyZ3MgPSB0aGlzQXJnID0gdW5kZWZpbmVkO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG4gIGRlYm91bmNlZC5jYW5jZWwgPSBjYW5jZWw7XG4gIGRlYm91bmNlZC5mbHVzaCA9IGZsdXNoO1xuICByZXR1cm4gZGVib3VuY2VkO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGRlYm91bmNlO1xuIiwidmFyIGlzT2JqZWN0ID0gcmVxdWlyZSgnLi9pc09iamVjdCcpO1xuXG4vKiogYE9iamVjdCN0b1N0cmluZ2AgcmVzdWx0IHJlZmVyZW5jZXMuICovXG52YXIgZnVuY1RhZyA9ICdbb2JqZWN0IEZ1bmN0aW9uXScsXG4gICAgZ2VuVGFnID0gJ1tvYmplY3QgR2VuZXJhdG9yRnVuY3Rpb25dJztcblxuLyoqIFVzZWQgZm9yIGJ1aWx0LWluIG1ldGhvZCByZWZlcmVuY2VzLiAqL1xudmFyIG9iamVjdFByb3RvID0gT2JqZWN0LnByb3RvdHlwZTtcblxuLyoqXG4gKiBVc2VkIHRvIHJlc29sdmUgdGhlIFtgdG9TdHJpbmdUYWdgXShodHRwOi8vZWNtYS1pbnRlcm5hdGlvbmFsLm9yZy9lY21hLTI2Mi82LjAvI3NlYy1vYmplY3QucHJvdG90eXBlLnRvc3RyaW5nKVxuICogb2YgdmFsdWVzLlxuICovXG52YXIgb2JqZWN0VG9TdHJpbmcgPSBvYmplY3RQcm90by50b1N0cmluZztcblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBjbGFzc2lmaWVkIGFzIGEgYEZ1bmN0aW9uYCBvYmplY3QuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBMYW5nXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIGNvcnJlY3RseSBjbGFzc2lmaWVkLCBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uaXNGdW5jdGlvbihfKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzRnVuY3Rpb24oL2FiYy8pO1xuICogLy8gPT4gZmFsc2VcbiAqL1xuZnVuY3Rpb24gaXNGdW5jdGlvbih2YWx1ZSkge1xuICAvLyBUaGUgdXNlIG9mIGBPYmplY3QjdG9TdHJpbmdgIGF2b2lkcyBpc3N1ZXMgd2l0aCB0aGUgYHR5cGVvZmAgb3BlcmF0b3JcbiAgLy8gaW4gU2FmYXJpIDggd2hpY2ggcmV0dXJucyAnb2JqZWN0JyBmb3IgdHlwZWQgYXJyYXkgY29uc3RydWN0b3JzLCBhbmRcbiAgLy8gUGhhbnRvbUpTIDEuOSB3aGljaCByZXR1cm5zICdmdW5jdGlvbicgZm9yIGBOb2RlTGlzdGAgaW5zdGFuY2VzLlxuICB2YXIgdGFnID0gaXNPYmplY3QodmFsdWUpID8gb2JqZWN0VG9TdHJpbmcuY2FsbCh2YWx1ZSkgOiAnJztcbiAgcmV0dXJuIHRhZyA9PSBmdW5jVGFnIHx8IHRhZyA9PSBnZW5UYWc7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNGdW5jdGlvbjtcbiIsIi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgdGhlIFtsYW5ndWFnZSB0eXBlXShodHRwczovL2VzNS5naXRodWIuaW8vI3g4KSBvZiBgT2JqZWN0YC5cbiAqIChlLmcuIGFycmF5cywgZnVuY3Rpb25zLCBvYmplY3RzLCByZWdleGVzLCBgbmV3IE51bWJlcigwKWAsIGFuZCBgbmV3IFN0cmluZygnJylgKVxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBhbiBvYmplY3QsIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5pc09iamVjdCh7fSk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc09iamVjdChbMSwgMiwgM10pO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNPYmplY3QoXy5ub29wKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzT2JqZWN0KG51bGwpO1xuICogLy8gPT4gZmFsc2VcbiAqL1xuZnVuY3Rpb24gaXNPYmplY3QodmFsdWUpIHtcbiAgdmFyIHR5cGUgPSB0eXBlb2YgdmFsdWU7XG4gIHJldHVybiAhIXZhbHVlICYmICh0eXBlID09ICdvYmplY3QnIHx8IHR5cGUgPT0gJ2Z1bmN0aW9uJyk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNPYmplY3Q7XG4iLCIvKipcbiAqIEdldHMgdGhlIHRpbWVzdGFtcCBvZiB0aGUgbnVtYmVyIG9mIG1pbGxpc2Vjb25kcyB0aGF0IGhhdmUgZWxhcHNlZCBzaW5jZVxuICogdGhlIFVuaXggZXBvY2ggKDEgSmFudWFyeSAxOTcwIDAwOjAwOjAwIFVUQykuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEB0eXBlIHtGdW5jdGlvbn1cbiAqIEBjYXRlZ29yeSBEYXRlXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBSZXR1cm5zIHRoZSB0aW1lc3RhbXAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uZGVmZXIoZnVuY3Rpb24oc3RhbXApIHtcbiAqICAgY29uc29sZS5sb2coXy5ub3coKSAtIHN0YW1wKTtcbiAqIH0sIF8ubm93KCkpO1xuICogLy8gPT4gbG9ncyB0aGUgbnVtYmVyIG9mIG1pbGxpc2Vjb25kcyBpdCB0b29rIGZvciB0aGUgZGVmZXJyZWQgZnVuY3Rpb24gdG8gYmUgaW52b2tlZFxuICovXG52YXIgbm93ID0gRGF0ZS5ub3c7XG5cbm1vZHVsZS5leHBvcnRzID0gbm93O1xuIiwidmFyIGRlYm91bmNlID0gcmVxdWlyZSgnLi9kZWJvdW5jZScpLFxuICAgIGlzT2JqZWN0ID0gcmVxdWlyZSgnLi9pc09iamVjdCcpO1xuXG4vKiogVXNlZCBhcyB0aGUgYFR5cGVFcnJvcmAgbWVzc2FnZSBmb3IgXCJGdW5jdGlvbnNcIiBtZXRob2RzLiAqL1xudmFyIEZVTkNfRVJST1JfVEVYVCA9ICdFeHBlY3RlZCBhIGZ1bmN0aW9uJztcblxuLyoqXG4gKiBDcmVhdGVzIGEgdGhyb3R0bGVkIGZ1bmN0aW9uIHRoYXQgb25seSBpbnZva2VzIGBmdW5jYCBhdCBtb3N0IG9uY2UgcGVyXG4gKiBldmVyeSBgd2FpdGAgbWlsbGlzZWNvbmRzLiBUaGUgdGhyb3R0bGVkIGZ1bmN0aW9uIGNvbWVzIHdpdGggYSBgY2FuY2VsYFxuICogbWV0aG9kIHRvIGNhbmNlbCBkZWxheWVkIGBmdW5jYCBpbnZvY2F0aW9ucyBhbmQgYSBgZmx1c2hgIG1ldGhvZCB0b1xuICogaW1tZWRpYXRlbHkgaW52b2tlIHRoZW0uIFByb3ZpZGUgYW4gb3B0aW9ucyBvYmplY3QgdG8gaW5kaWNhdGUgd2hldGhlclxuICogYGZ1bmNgIHNob3VsZCBiZSBpbnZva2VkIG9uIHRoZSBsZWFkaW5nIGFuZC9vciB0cmFpbGluZyBlZGdlIG9mIHRoZSBgd2FpdGBcbiAqIHRpbWVvdXQuIFRoZSBgZnVuY2AgaXMgaW52b2tlZCB3aXRoIHRoZSBsYXN0IGFyZ3VtZW50cyBwcm92aWRlZCB0byB0aGVcbiAqIHRocm90dGxlZCBmdW5jdGlvbi4gU3Vic2VxdWVudCBjYWxscyB0byB0aGUgdGhyb3R0bGVkIGZ1bmN0aW9uIHJldHVybiB0aGVcbiAqIHJlc3VsdCBvZiB0aGUgbGFzdCBgZnVuY2AgaW52b2NhdGlvbi5cbiAqXG4gKiAqKk5vdGU6KiogSWYgYGxlYWRpbmdgIGFuZCBgdHJhaWxpbmdgIG9wdGlvbnMgYXJlIGB0cnVlYCwgYGZ1bmNgIGlzIGludm9rZWRcbiAqIG9uIHRoZSB0cmFpbGluZyBlZGdlIG9mIHRoZSB0aW1lb3V0IG9ubHkgaWYgdGhlIHRocm90dGxlZCBmdW5jdGlvbiBpc1xuICogaW52b2tlZCBtb3JlIHRoYW4gb25jZSBkdXJpbmcgdGhlIGB3YWl0YCB0aW1lb3V0LlxuICpcbiAqIFNlZSBbRGF2aWQgQ29yYmFjaG8ncyBhcnRpY2xlXShodHRwOi8vZHJ1cGFsbW90aW9uLmNvbS9hcnRpY2xlL2RlYm91bmNlLWFuZC10aHJvdHRsZS12aXN1YWwtZXhwbGFuYXRpb24pXG4gKiBmb3IgZGV0YWlscyBvdmVyIHRoZSBkaWZmZXJlbmNlcyBiZXR3ZWVuIGBfLnRocm90dGxlYCBhbmQgYF8uZGVib3VuY2VgLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgRnVuY3Rpb25cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHRocm90dGxlLlxuICogQHBhcmFtIHtudW1iZXJ9IFt3YWl0PTBdIFRoZSBudW1iZXIgb2YgbWlsbGlzZWNvbmRzIHRvIHRocm90dGxlIGludm9jYXRpb25zIHRvLlxuICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSBUaGUgb3B0aW9ucyBvYmplY3QuXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtvcHRpb25zLmxlYWRpbmc9dHJ1ZV0gU3BlY2lmeSBpbnZva2luZyBvbiB0aGUgbGVhZGluZ1xuICogIGVkZ2Ugb2YgdGhlIHRpbWVvdXQuXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtvcHRpb25zLnRyYWlsaW5nPXRydWVdIFNwZWNpZnkgaW52b2tpbmcgb24gdGhlIHRyYWlsaW5nXG4gKiAgZWRnZSBvZiB0aGUgdGltZW91dC5cbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gUmV0dXJucyB0aGUgbmV3IHRocm90dGxlZCBmdW5jdGlvbi5cbiAqIEBleGFtcGxlXG4gKlxuICogLy8gQXZvaWQgZXhjZXNzaXZlbHkgdXBkYXRpbmcgdGhlIHBvc2l0aW9uIHdoaWxlIHNjcm9sbGluZy5cbiAqIGpRdWVyeSh3aW5kb3cpLm9uKCdzY3JvbGwnLCBfLnRocm90dGxlKHVwZGF0ZVBvc2l0aW9uLCAxMDApKTtcbiAqXG4gKiAvLyBJbnZva2UgYHJlbmV3VG9rZW5gIHdoZW4gdGhlIGNsaWNrIGV2ZW50IGlzIGZpcmVkLCBidXQgbm90IG1vcmUgdGhhbiBvbmNlIGV2ZXJ5IDUgbWludXRlcy5cbiAqIHZhciB0aHJvdHRsZWQgPSBfLnRocm90dGxlKHJlbmV3VG9rZW4sIDMwMDAwMCwgeyAndHJhaWxpbmcnOiBmYWxzZSB9KTtcbiAqIGpRdWVyeShlbGVtZW50KS5vbignY2xpY2snLCB0aHJvdHRsZWQpO1xuICpcbiAqIC8vIENhbmNlbCB0aGUgdHJhaWxpbmcgdGhyb3R0bGVkIGludm9jYXRpb24uXG4gKiBqUXVlcnkod2luZG93KS5vbigncG9wc3RhdGUnLCB0aHJvdHRsZWQuY2FuY2VsKTtcbiAqL1xuZnVuY3Rpb24gdGhyb3R0bGUoZnVuYywgd2FpdCwgb3B0aW9ucykge1xuICB2YXIgbGVhZGluZyA9IHRydWUsXG4gICAgICB0cmFpbGluZyA9IHRydWU7XG5cbiAgaWYgKHR5cGVvZiBmdW5jICE9ICdmdW5jdGlvbicpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKEZVTkNfRVJST1JfVEVYVCk7XG4gIH1cbiAgaWYgKGlzT2JqZWN0KG9wdGlvbnMpKSB7XG4gICAgbGVhZGluZyA9ICdsZWFkaW5nJyBpbiBvcHRpb25zID8gISFvcHRpb25zLmxlYWRpbmcgOiBsZWFkaW5nO1xuICAgIHRyYWlsaW5nID0gJ3RyYWlsaW5nJyBpbiBvcHRpb25zID8gISFvcHRpb25zLnRyYWlsaW5nIDogdHJhaWxpbmc7XG4gIH1cbiAgcmV0dXJuIGRlYm91bmNlKGZ1bmMsIHdhaXQsIHtcbiAgICAnbGVhZGluZyc6IGxlYWRpbmcsXG4gICAgJ21heFdhaXQnOiB3YWl0LFxuICAgICd0cmFpbGluZyc6IHRyYWlsaW5nXG4gIH0pO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHRocm90dGxlO1xuIiwidmFyIGlzRnVuY3Rpb24gPSByZXF1aXJlKCcuL2lzRnVuY3Rpb24nKSxcbiAgICBpc09iamVjdCA9IHJlcXVpcmUoJy4vaXNPYmplY3QnKTtcblxuLyoqIFVzZWQgYXMgcmVmZXJlbmNlcyBmb3IgdmFyaW91cyBgTnVtYmVyYCBjb25zdGFudHMuICovXG52YXIgTkFOID0gMCAvIDA7XG5cbi8qKiBVc2VkIHRvIG1hdGNoIGxlYWRpbmcgYW5kIHRyYWlsaW5nIHdoaXRlc3BhY2UuICovXG52YXIgcmVUcmltID0gL15cXHMrfFxccyskL2c7XG5cbi8qKiBVc2VkIHRvIGRldGVjdCBiYWQgc2lnbmVkIGhleGFkZWNpbWFsIHN0cmluZyB2YWx1ZXMuICovXG52YXIgcmVJc0JhZEhleCA9IC9eWy0rXTB4WzAtOWEtZl0rJC9pO1xuXG4vKiogVXNlZCB0byBkZXRlY3QgYmluYXJ5IHN0cmluZyB2YWx1ZXMuICovXG52YXIgcmVJc0JpbmFyeSA9IC9eMGJbMDFdKyQvaTtcblxuLyoqIFVzZWQgdG8gZGV0ZWN0IG9jdGFsIHN0cmluZyB2YWx1ZXMuICovXG52YXIgcmVJc09jdGFsID0gL14wb1swLTddKyQvaTtcblxuLyoqIEJ1aWx0LWluIG1ldGhvZCByZWZlcmVuY2VzIHdpdGhvdXQgYSBkZXBlbmRlbmN5IG9uIGByb290YC4gKi9cbnZhciBmcmVlUGFyc2VJbnQgPSBwYXJzZUludDtcblxuLyoqXG4gKiBDb252ZXJ0cyBgdmFsdWVgIHRvIGEgbnVtYmVyLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gcHJvY2Vzcy5cbiAqIEByZXR1cm5zIHtudW1iZXJ9IFJldHVybnMgdGhlIG51bWJlci5cbiAqIEBleGFtcGxlXG4gKlxuICogXy50b051bWJlcigzKTtcbiAqIC8vID0+IDNcbiAqXG4gKiBfLnRvTnVtYmVyKE51bWJlci5NSU5fVkFMVUUpO1xuICogLy8gPT4gNWUtMzI0XG4gKlxuICogXy50b051bWJlcihJbmZpbml0eSk7XG4gKiAvLyA9PiBJbmZpbml0eVxuICpcbiAqIF8udG9OdW1iZXIoJzMnKTtcbiAqIC8vID0+IDNcbiAqL1xuZnVuY3Rpb24gdG9OdW1iZXIodmFsdWUpIHtcbiAgaWYgKGlzT2JqZWN0KHZhbHVlKSkge1xuICAgIHZhciBvdGhlciA9IGlzRnVuY3Rpb24odmFsdWUudmFsdWVPZikgPyB2YWx1ZS52YWx1ZU9mKCkgOiB2YWx1ZTtcbiAgICB2YWx1ZSA9IGlzT2JqZWN0KG90aGVyKSA/IChvdGhlciArICcnKSA6IG90aGVyO1xuICB9XG4gIGlmICh0eXBlb2YgdmFsdWUgIT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gdmFsdWUgPT09IDAgPyB2YWx1ZSA6ICt2YWx1ZTtcbiAgfVxuICB2YWx1ZSA9IHZhbHVlLnJlcGxhY2UocmVUcmltLCAnJyk7XG4gIHZhciBpc0JpbmFyeSA9IHJlSXNCaW5hcnkudGVzdCh2YWx1ZSk7XG4gIHJldHVybiAoaXNCaW5hcnkgfHwgcmVJc09jdGFsLnRlc3QodmFsdWUpKVxuICAgID8gZnJlZVBhcnNlSW50KHZhbHVlLnNsaWNlKDIpLCBpc0JpbmFyeSA/IDIgOiA4KVxuICAgIDogKHJlSXNCYWRIZXgudGVzdCh2YWx1ZSkgPyBOQU4gOiArdmFsdWUpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHRvTnVtYmVyO1xuIiwiLyoqXHJcbiAqIFZ1ZSBhbmQgZXZlcnkgY29uc3RydWN0b3IgdGhhdCBleHRlbmRzIFZ1ZSBoYXMgYW5cclxuICogYXNzb2NpYXRlZCBvcHRpb25zIG9iamVjdCwgd2hpY2ggY2FuIGJlIGFjY2Vzc2VkIGR1cmluZ1xyXG4gKiBjb21waWxhdGlvbiBzdGVwcyBhcyBgdGhpcy5jb25zdHJ1Y3Rvci5vcHRpb25zYC5cclxuICpcclxuICogVGhlc2UgY2FuIGJlIHNlZW4gYXMgdGhlIGRlZmF1bHQgb3B0aW9ucyBvZiBldmVyeVxyXG4gKiBWdWUgaW5zdGFuY2UuXHJcbiAqL1xyXG4oZnVuY3Rpb24ocm9vdCwgZmFjdG9yeSkge1xyXG5cclxuICAgIGlmICh0eXBlb2YgbW9kdWxlID09PSBcIm9iamVjdFwiICYmIG1vZHVsZS5leHBvcnRzKSB7XHJcbiAgICAgICAgbW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KHJlcXVpcmUoXCJpbnRlcmFjdC5qc1wiKSwgcmVxdWlyZShcImxvZGFzaC90aHJvdHRsZVwiKSwgcmVxdWlyZShcImxvZGFzaC9kZWJvdW5jZVwiKSk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHJvb3QuU29ydGFibGUgPSBmYWN0b3J5KHJvb3QuaW50ZXJhY3QsIHJvb3QuXy50aHJvdHRsZSwgcm9vdC5fLmRlYm91bmNlKTtcclxuICAgIH1cclxuXHJcbn0pKHRoaXMsIGZ1bmN0aW9uKGludGVyYWN0LCB0aHJvdHRsZSwgZGVib3VuY2Upe1xyXG5cclxuICAgIHZhciBTb3J0YWJsZSA9IGZ1bmN0aW9uKGVsZW1lbnQsIHNjcm9sbGFibGUpe1xyXG4gICAgICAgIHRoaXMuc2Nyb2xsYWJsZSA9IHNjcm9sbGFibGUgfHwgd2luZG93LmRvY3VtZW50LmJvZHk7XHJcbiAgICAgICAgdGhpcy5lbGVtZW50ID0gZWxlbWVudDtcclxuICAgICAgICB0aGlzLml0ZW1zICAgPSB0aGlzLmVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCh0aGlzLmVsZW1lbnQuZGF0YXNldC5zb3J0YWJsZSk7XHJcbiAgICAgICAgdGhpcy5lbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gXCJyZWxhdGl2ZVwiO1xyXG4gICAgICAgIHRoaXMuZWxlbWVudC5zdHlsZS53ZWJraXRUb3VjaENhbGxvdXQgPSBcIm5vbmVcIjtcclxuICAgICAgICB0aGlzLmVsZW1lbnQuc3R5bGUud2Via2l0VXNlclNlbGVjdCA9IFwibm9uZVwiO1xyXG4gICAgICAgIHRoaXMuYmluZEV2ZW50cygpO1xyXG4gICAgICAgIHRoaXMuc2V0UG9zaXRpb25zKCk7XHJcbiAgICB9O1xyXG5cclxuICAgIC8qKlxyXG4gICAgKiBCaW5kIEV2ZW50c1xyXG4gICAgKi9cclxuICAgIFNvcnRhYmxlLnByb3RvdHlwZS5iaW5kRXZlbnRzID0gZnVuY3Rpb24oKXtcclxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJyZXNpemVcIiwgZGVib3VuY2UoZnVuY3Rpb24oKXtcclxuICAgICAgICAgICBzZWxmLnNldFBvc2l0aW9ucygpO1xyXG4gICAgICAgIH0sIDIwMCkpO1xyXG4gICAgICAgIGludGVyYWN0KHRoaXMuZWxlbWVudC5kYXRhc2V0LnNvcnRhYmxlLCB7XHJcbiAgICAgICAgICAgIGNvbnRleHQ6IHRoaXMuZWxlbWVudFxyXG4gICAgICAgIH0pLmRyYWdnYWJsZSh7XHJcbiAgICAgICAgICAgIGluZXJ0aWE6IGZhbHNlLFxyXG4gICAgICAgICAgICBtYW51YWxTdGFydDogKFwib250b3VjaHN0YXJ0XCIgaW4gd2luZG93KSB8fCB3aW5kb3cuRG9jdW1lbnRUb3VjaCAmJiB3aW5kb3cuZG9jdW1lbnQgaW5zdGFuY2VvZiB3aW5kb3cuRG9jdW1lbnRUb3VjaCxcclxuICAgICAgICAgICAgYXV0b1Njcm9sbDoge1xyXG4gICAgICAgICAgICAgICAgY29udGFpbmVyOiB0aGlzLnNjcm9sbGFibGUgPT09IHdpbmRvdy5kb2N1bWVudC5ib2R5ID8gbnVsbCA6IHRoaXMuc2Nyb2xsYWJsZSxcclxuICAgICAgICAgICAgICAgIG1hcmdpbjogNTAsXHJcbiAgICAgICAgICAgICAgICBzcGVlZDogNjAwXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIG9ubW92ZTogdGhyb3R0bGUoZnVuY3Rpb24oZSl7XHJcbiAgICAgICAgICAgICAgICBzZWxmLm1vdmUoZSk7XHJcbiAgICAgICAgICAgIH0sIDE2LCB7dHJhaWxpbmc6IGZhbHNlfSlcclxuICAgICAgICB9KVxyXG4gICAgICAgIC5vZmYoXCJkcmFnc3RhcnRcIilcclxuICAgICAgICAub2ZmKFwiZHJhZ2VuZFwiKVxyXG4gICAgICAgIC5vZmYoXCJob2xkXCIpXHJcbiAgICAgICAgLm9uKFwiZHJhZ3N0YXJ0XCIsIGZ1bmN0aW9uKGUpe1xyXG4gICAgICAgICAgICB2YXIgciA9IGUudGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICAgICAgICBlLnRhcmdldC5jbGFzc0xpc3QuYWRkKFwiaXMtZHJhZ2dlZFwiKTtcclxuICAgICAgICAgICAgZS50YXJnZXQuc3R5bGUudHJhbnNpdGlvbkR1cmF0aW9uID0gXCIwc1wiO1xyXG4gICAgICAgICAgICBzZWxmLnN0YXJ0UG9zaXRpb24gPSBlLnRhcmdldC5kYXRhc2V0LnBvc2l0aW9uO1xyXG4gICAgICAgICAgICBzZWxmLm9mZnNldCA9IHtcclxuICAgICAgICAgICAgICAgIHg6IGUuY2xpZW50WCAtIHIubGVmdCxcclxuICAgICAgICAgICAgICAgIHk6IGUuY2xpZW50WSAtIHIudG9wXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIHNlbGYuc2Nyb2xsVG9wU3RhcnQgPSBzZWxmLnNjcm9sbGFibGUuc2Nyb2xsVG9wO1xyXG4gICAgICAgIH0pLm9uKFwiZHJhZ2VuZFwiLCBmdW5jdGlvbihlKXtcclxuICAgICAgICAgICAgZS50YXJnZXQuY2xhc3NMaXN0LnJlbW92ZShcImlzLWRyYWdnZWRcIik7XHJcbiAgICAgICAgICAgIGUudGFyZ2V0LnN0eWxlLnRyYW5zaXRpb25EdXJhdGlvbiA9IG51bGw7XHJcbiAgICAgICAgICAgIHNlbGYubW92ZUl0ZW0oZS50YXJnZXQsIGUudGFyZ2V0LmRhdGFzZXQucG9zaXRpb24pO1xyXG4gICAgICAgICAgICBzZWxmLnNlbmRSZXN1bHRzKCk7XHJcbiAgICAgICAgfSkub24oXCJob2xkXCIsIGZ1bmN0aW9uKGUpe1xyXG4gICAgICAgICAgICBpZighZS5pbnRlcmFjdGlvbi5pbnRlcmFjdGluZygpKXtcclxuICAgICAgICAgICAgICAgIGUuaW50ZXJhY3Rpb24uc3RhcnQoe1xyXG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IFwiZHJhZ1wiXHJcbiAgICAgICAgICAgICAgICB9LCBlLmludGVyYWN0YWJsZSwgZS5jdXJyZW50VGFyZ2V0KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICogQnVpbGQgdGhlIGdyaWRcclxuICAgICogLSBJdGVtcyBwb3NpdGlvbiBpcyBzZXQgdG8gXCJhYnNvbHV0ZVwiXHJcbiAgICAqIC0gRXZlcnkgaXRlbXMgaXMgcG9zaXRpb25lZCB1c2luZyB0cmFuc2Zvcm1cclxuICAgICogLSBUcmFuc2l0aW9uIGR1cmF0aW9uIGlzIHNldCB0byAwIGR1cmluZyB0aGlzIG9wZXJhdGlvblxyXG4gICAgKiovXHJcbiAgICBTb3J0YWJsZS5wcm90b3R5cGUuc2V0UG9zaXRpb25zID0gZnVuY3Rpb24oKXtcclxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICAgICAgdmFyIHJlY3QgPSB0aGlzLml0ZW1zWzBdLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICAgIHRoaXMuaXRlbV93aWR0aCA9IE1hdGguZmxvb3IocmVjdC53aWR0aCk7XHJcbiAgICAgICAgdGhpcy5pdGVtX2hlaWdodCA9IE1hdGguZmxvb3IocmVjdC5oZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuY29scyA9IE1hdGguZmxvb3IodGhpcy5lbGVtZW50Lm9mZnNldFdpZHRoIC8gdGhpcy5pdGVtX3dpZHRoKTtcclxuICAgICAgICB0aGlzLmVsZW1lbnQuc3R5bGUuaGVpZ2h0ID0gKHRoaXMuaXRlbV9oZWlnaHQgKiBNYXRoLmNlaWwodGhpcy5pdGVtcy5sZW5ndGggLyB0aGlzLmNvbHMpKSArIFwicHhcIjtcclxuICAgICAgICBmb3IodmFyIGkgPSAwLCB4ID0gdGhpcy5pdGVtcy5sZW5ndGg7IGkgPCB4OyBpKyspIHtcclxuICAgICAgICAgICAgdmFyIGl0ZW0gPSB0aGlzLml0ZW1zW2ldO1xyXG4gICAgICAgICAgICBpdGVtLnN0eWxlLnBvc2l0aW9uID0gXCJhYnNvbHV0ZVwiO1xyXG4gICAgICAgICAgICBpdGVtLnN0eWxlLnRvcCA9IFwiMHB4XCI7XHJcbiAgICAgICAgICAgIGl0ZW0uc3R5bGUubGVmdCA9IFwiMHB4XCI7XHJcbiAgICAgICAgICAgIGl0ZW0uc3R5bGUudHJhbnNpdGlvbkR1cmF0aW9uID0gXCIwc1wiO1xyXG4gICAgICAgICAgICB0aGlzLm1vdmVJdGVtKGl0ZW0sIGl0ZW0uZGF0YXNldC5wb3NpdGlvbik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XHJcbiAgICAgICAgICAgICBmb3IodmFyIGkgPSAwLCB4ID0gc2VsZi5pdGVtcy5sZW5ndGg7IGkgPCB4OyBpKyspIHtcclxuICAgICAgICAgICAgICAgIHZhciBpdGVtID0gc2VsZi5pdGVtc1tpXTtcclxuICAgICAgICAgICAgICAgIGl0ZW0uc3R5bGUudHJhbnNpdGlvbkR1cmF0aW9uID0gbnVsbDtcclxuICAgICAgICAgICAgIH1cclxuICAgICAgICB9LCAxMDApO1xyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICogTW92ZSBhbiBlbGVtZW50IHRvIGZvbGxvdyBtb3VzZSBjdXJzb3JcclxuICAgICogQHBhcmFtIGUgaW50ZXJhY3QuanMgZXZlbnRcclxuICAgICovXHJcbiAgICBTb3J0YWJsZS5wcm90b3R5cGUubW92ZSA9IGZ1bmN0aW9uKGUpe1xyXG4gICAgICAgIHZhciBwID0gdGhpcy5nZXRYWSh0aGlzLnN0YXJ0UG9zaXRpb24pO1xyXG4gICAgICAgIHZhciB4ID0gcC54ICsgZS5jbGllbnRYIC0gZS5jbGllbnRYMDtcclxuICAgICAgICB2YXIgeSA9IHAueSArIGUuY2xpZW50WSAtIGUuY2xpZW50WTAgKyB0aGlzLnNjcm9sbGFibGUuc2Nyb2xsVG9wIC0gdGhpcy5zY3JvbGxUb3BTdGFydDtcclxuICAgICAgICBlLnRhcmdldC5zdHlsZS50cmFuc2Zvcm0gPSBcInRyYW5zbGF0ZTNEKFwiICsgeCArIFwicHgsIFwiICsgeSArIFwicHgsIDApXCI7XHJcbiAgICAgICAgdmFyIG9sZFBvc2l0aW9uID0gcGFyc2VJbnQoZS50YXJnZXQuZGF0YXNldC5wb3NpdGlvbiwgMTApO1xyXG4gICAgICAgIHZhciBuZXdQb3NpdGlvbiA9IHRoaXMuZ3Vlc3NQb3NpdGlvbih4ICsgdGhpcy5vZmZzZXQueCwgeSArIHRoaXMub2Zmc2V0LnkpO1xyXG4gICAgICAgIGlmKG9sZFBvc2l0aW9uICE9PSBuZXdQb3NpdGlvbil7XHJcbiAgICAgICAgICAgIHRoaXMuc3dhcChvbGRQb3NpdGlvbiwgbmV3UG9zaXRpb24pO1xyXG4gICAgICAgICAgICBlLnRhcmdldC5kYXRhc2V0LnBvc2l0aW9uID0gbmV3UG9zaXRpb247XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuZ3Vlc3NQb3NpdGlvbih4LCB5KTtcclxuICAgIH07XHJcblxyXG4gICAgLypcclxuICAgICogR2V0IHBvc2l0aW9uIG9mIGFuIGVsZW1lbnQgcmVsYXRpdmUgdG8gdGhlIHBhcmVudFxyXG4gICAgKiB4OjAsIHk6MCBiZWluZyB0aGUgdG9wIGxlZnQgY29ybmVyIG9mIHRoZSBjb250YWluZXJcclxuICAgICovXHJcbiAgICBTb3J0YWJsZS5wcm90b3R5cGUuZ2V0WFkgPSBmdW5jdGlvbihwb3NpdGlvbil7XHJcbiAgICAgICAgdmFyIHggPSB0aGlzLml0ZW1fd2lkdGggKiAocG9zaXRpb24gJSB0aGlzLmNvbHMpO1xyXG4gICAgICAgIHZhciB5ID0gdGhpcy5pdGVtX2hlaWdodCAqIE1hdGguZmxvb3IocG9zaXRpb24gLyB0aGlzLmNvbHMpO1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIHg6IHgsXHJcbiAgICAgICAgICAgIHk6IHlcclxuICAgICAgICB9O1xyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICogR3Vlc3MgdGhlIHBvc2l0aW9uIG51bWJlciBmcm9tIHgsIHlcclxuICAgICogQHBhcmFtIHhcclxuICAgICogQHBhcmFtIHlcclxuICAgICogQHJldHVybnMge251bWJlcn1cclxuICAgICovXHJcbiAgICBTb3J0YWJsZS5wcm90b3R5cGUuZ3Vlc3NQb3NpdGlvbiA9IGZ1bmN0aW9uKHgsIHkpe1xyXG4gICAgICAgIHZhciBjb2wgPSBNYXRoLmZsb29yKHggLyB0aGlzLml0ZW1fd2lkdGgpO1xyXG4gICAgICAgIGlmKGNvbCA+PSB0aGlzLmNvbHMpe1xyXG4gICAgICAgICAgICBjb2wgPSB0aGlzLmNvbHMgLSAxO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZihjb2wgPD0gMCl7XHJcbiAgICAgICAgICAgIGNvbCA9IDA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHZhciByb3cgPSBNYXRoLmZsb29yKHkgLyB0aGlzLml0ZW1faGVpZ2h0KTtcclxuICAgICAgICBpZihyb3cgPCAwKXtcclxuICAgICAgICAgICAgcm93ID0gMDtcclxuICAgICAgICB9XHJcbiAgICAgICAgdmFyIHBvc2l0aW9uID0gY29sICsgcm93ICogdGhpcy5jb2xzO1xyXG4gICAgICAgIGlmKHBvc2l0aW9uID49IHRoaXMuaXRlbXMubGVuZ3RoKXtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaXRlbXMubGVuZ3RoIC0gMTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHBvc2l0aW9uO1xyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICogR3Vlc3MgdGhlIHBvc2l0aW9uIGZyb20geCwgeVxyXG4gICAgKiBAcGFyYW0gc3RhcnRcclxuICAgICogQHBhcmFtIGVuZFxyXG4gICAgKi9cclxuICAgIFNvcnRhYmxlLnByb3RvdHlwZS5zd2FwID0gZnVuY3Rpb24oc3RhcnQsIGVuZCl7XHJcbiAgICAgICAgZm9yKHZhciBpID0gMCwgeCA9IHRoaXMuaXRlbXMubGVuZ3RoOyBpIDwgeDsgaSsrKSB7XHJcbiAgICAgICAgICAgIHZhciBpdGVtID0gdGhpcy5pdGVtc1tpXTtcclxuICAgICAgICAgICAgaWYoIWl0ZW0uY2xhc3NMaXN0LmNvbnRhaW5zKFwiaXMtZHJhZ2dlZFwiKSl7XHJcbiAgICAgICAgICAgICAgICB2YXIgcG9zaXRpb24gPSBwYXJzZUludChpdGVtLmRhdGFzZXQucG9zaXRpb24sIDEwKTtcclxuICAgICAgICAgICAgICAgIGlmKHBvc2l0aW9uID49IGVuZCAmJiBwb3NpdGlvbiA8IHN0YXJ0ICYmIGVuZCA8IHN0YXJ0KXtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLm1vdmVJdGVtKGl0ZW0sIHBvc2l0aW9uICsgMSk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYocG9zaXRpb24gPD0gZW5kICYmIHBvc2l0aW9uID4gc3RhcnQgJiYgZW5kID4gc3RhcnQpe1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubW92ZUl0ZW0oaXRlbSwgcG9zaXRpb24gLSAxKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgLyoqXHJcbiAgICAqIE1vdmUgYW4gaXRlbSB0byBoaXMgbmV3IHBvc2l0aW9uXHJcbiAgICAqIEBwYXJhbSBpdGVtXHJcbiAgICAqIEBwYXJhbSBwb3NpdGlvblxyXG4gICAgKi9cclxuICAgIFNvcnRhYmxlLnByb3RvdHlwZS5tb3ZlSXRlbSA9IGZ1bmN0aW9uKGl0ZW0sIHBvc2l0aW9uKXtcclxuICAgICAgICB2YXIgcCA9IHRoaXMuZ2V0WFkocG9zaXRpb24pO1xyXG4gICAgICAgIGl0ZW0uc3R5bGUudHJhbnNmb3JtID0gXCJ0cmFuc2xhdGUzRChcIiArIHAueCArIFwicHgsIFwiICsgcC55ICsgXCJweCwgMClcIjtcclxuICAgICAgICBpdGVtLmRhdGFzZXQucG9zaXRpb24gPSBwb3NpdGlvbjtcclxuICAgIH07XHJcblxyXG4gICAgLyoqXHJcbiAgICAqIFNlbmQgcmVzdWx0c1xyXG4gICAgKiBAcGFyYW0gaXRlbVxyXG4gICAgKiBAcGFyYW0gcG9zaXRpb25cclxuICAgICovXHJcbiAgICBTb3J0YWJsZS5wcm90b3R5cGUuc2VuZFJlc3VsdHMgPSBmdW5jdGlvbigpe1xyXG4gICAgICAgIHZhciByZXN1bHRzID0ge307XHJcbiAgICAgICAgZm9yKHZhciBpID0gMCwgeCA9IHRoaXMuaXRlbXMubGVuZ3RoOyBpIDwgeDsgaSsrKSB7XHJcbiAgICAgICAgICAgIHZhciBpdGVtID0gdGhpcy5pdGVtc1tpXTtcclxuICAgICAgICAgICAgcmVzdWx0c1tpdGVtLmRhdGFzZXQuaWRdID0gaXRlbS5kYXRhc2V0LnBvc2l0aW9uO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnN1Y2Nlc3MocmVzdWx0cyk7XHJcbiAgICB9O1xyXG5cclxuICAgIHJldHVybiBTb3J0YWJsZTtcclxufSk7IiwiLy8gVXNlZCBmb3IgZ3VscCB0YXNrICh1c2VsZXNzIG90aGVyd2lzZSlcclxud2luZG93LlNvcnRhYmxlID0gcmVxdWlyZSgnLi9Tb3J0YWJsZScpOyJdfQ==
