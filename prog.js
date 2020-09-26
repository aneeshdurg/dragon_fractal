let ANGLE = Math.PI / 2;

class DragonFractal {
    constructor(start, end) {
        this.start = start;
        this.end = end;

        // TODO track height/width to adjust zoom factor
    }

    rotate_around_end(point, angle) {
        // transform end to origin
        const transformed_start = [point[0] - this.end[0], point[1] - this.end[1]];
        console.log("tstart", transformed_start);

        // convert to polar coords
        const r = Math.sqrt(Math.pow(transformed_start[0], 2) + Math.pow(transformed_start[1], 2))
        let theta = Math.atan(transformed_start[1] / transformed_start[0]);
        if (transformed_start[0] < 0)
            theta += Math.PI;
        console.log("polar", r, theta);

        theta += angle;

        console.log("rotated polar", r, theta);
        // convert to cartesian coords and undo transform
        const transformed_new_point = [r * Math.cos(theta), r * Math.sin(theta)];
        console.log("tnew", transformed_new_point);
        return [transformed_new_point[0] + this.end[0], transformed_new_point[1] + this.end[1]]
    }

    update_end() {
        this.end = this.rotate_around_end(this.start, ANGLE);
        console.log("final", this.end);
    }

}

async function loadTwgl() {
    const p = new Promise((resolve) => {
        const script = document.createElement("script");
        script.type = "text/javascript";
        script.src = "https://twgljs.org/dist/4.x/twgl-full.min.js";
        script.onreadystatechange = resolve;
        script.onload = resolve;
        document.head.appendChild(script);
    });
    return p;
}

_fileCache = {}
async function getFile(url) {
    if (url in _fileCache)
        return _fileCache[url];

    const resp = await fetch(url);
    if (resp.status !== 200)
        throw("Could not find shader " + url);

    let fileContents = "";
    const reader = resp.body.getReader();
    done = false;
    while (!done) {
        let fileBody = await reader.read();
        if (!fileBody.value) {
            done = true;
        } else {
            fileContents += String.fromCharCode.apply(null, fileBody.value);
        }
    }
    _fileCache[url] = fileContents;
    return fileContents;
}

/**
 * @param gl webgl2 instance
 * @param dimensions [width, height] tuple for texture dimensions
 * @param data - can be null, if not will be used as the source for the texture
 */
function createTexture(gl, dimensions, data) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0, // level
        gl.RGBA32F, // internal format
        dimensions[0], // width
        dimensions[1], // height
        0, // border
        gl.RGBA, // format
        gl.FLOAT, // type
        data, /* source */);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    return tex;
}

function render(gl) {
    // draw the quad (2 triangles)
    const offset = 0;
    const numVertices = 6;
    gl.drawArrays(gl.TRIANGLES, offset, numVertices);
}

function setupProgram(gl, programInfo, bufferInfo) {
    gl.useProgram(programInfo.program);

    twgl.setBuffersAndAttributes(gl, programInfo, bufferInfo);

}

function enableGlExts(gl) {
    gl.getExtension('OES_texture_float');        // just in case
    gl.getExtension('OES_texture_float_linear');
    ext = gl.getExtension('EXT_color_buffer_float');
    if (!ext) {
        alert("no ext color...");
        throw new Error("!");
    }
}

const vs = `
    #version 300 es
    in vec4 position;
    void main() {
      gl_Position = position;
    }`;

const bufferArrays = {
    position: {
        data: [
          -1, -1,
           1, -1,
          -1,  1,
          -1,  1,
           1, -1,
           1,  1,
        ],
        numComponents: 2,
    },
};

var gl = null;
async function main(canvas, root, fps) {
    fps = fps || 30;
    root = root || ".";

    await loadTwgl();

    const dimensions = [1000, 1000];

    canvas.width = dimensions[0];
    canvas.height = dimensions[1];
    gl = canvas.getContext("webgl2"/*, {premultipliedAlpha: false}*/);
    if (!gl)
        throw new Error("Could not initialize webgl2 context! Does your browser support webgl2?");
    enableGlExts(gl);

    const fragShader = await getFile(root + "/compute.frag.c");
    const programInfo = twgl.createProgramInfo(gl, [vs, fragShader]);

    const bufferInfo = twgl.createBufferInfoFromArrays(gl, bufferArrays);
    setupProgram(gl, programInfo, bufferInfo);

    const computeDsts = [
        createTexture(gl, dimensions, null),
        createTexture(gl, dimensions, null)
    ];
    const fb = gl.createFramebuffer();

    const domain = new Float32Array([-2, 2]);
    const range = new Float32Array([-2, 2]);

    let counter = 0;

    function src() {
        return computeDsts[counter];
    }

    function dst() {
        return computeDsts[(counter + 1) % 2];
    }

    function flipflop() {
        counter = counter + 1;
        counter %= 2;
    }

    let lastRender = 0;
    const mspf = 1000/fps;
    // function step(time) {
    //     if ((time - lastRender) < mspf) {
    //         requestAnimationFrame(step);
    //         return;
    //     }

    const line_length = 10;
    const area_length = 10;
    const d = new DragonFractal([0, 0], [area_length, 0])

    // Set up parameters for compute
    twgl.setUniforms(programInfo, {
        u_angle: ANGLE,
        u_dimensions: dimensions,
        u_initialize: true,
        u_initial_length: line_length,
        u_render: false,
        u_texture: src(),
    });

    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dst(), 0 /* level */);
    gl.finish();

    render(gl);
    gl.finish();

    flipflop();

    async function run() {
        function draw_angle(angle) {
            twgl.setUniforms(programInfo, {
                u_angle: angle,
                u_dimensions: dimensions,
                u_initialize: false,
                u_render: false,
                u_texture: src(),
                u_pivot: d.end
            });

            gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dst(), 0 /* level */);
            gl.finish();

            render(gl);
            gl.finish();

            // Set up parameters for render
            twgl.setUniforms(programInfo, {
                u_render: true,
                u_texture: dst(),
                u_texture_1: src(),
                u_dimensions: dimensions
            });

            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            render(gl);
            gl.finish();
        }

        let i = 0.1;
        while (i < ANGLE) {
            i += 0.1;
            draw_angle(i);
            await new Promise(r => setTimeout(r, 10));
        }

        draw_angle(ANGLE);

        // TODO zoom out and also compute where the end point is in screen
        // coords.
        d.update_end();
        flipflop();

        // ANGLE += Math.PI / 4;
        // if (ANGLE >= 2 * Math.PI)
        //     ANGLE -= 2 * Math.PI;
        setTimeout(run, 500);
    }

    run();
}
