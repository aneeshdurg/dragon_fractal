#version 300 es
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
precision highp int;
#else
precision mediump float;
precision mediump int;
#endif

#define PI 3.1415926538
#define GOLDEN_RATIO 1.6180339887

uniform bool u_render;
uniform vec2 u_dimensions;
uniform float u_angle;
uniform vec2 u_pivot;
uniform vec3 u_color;
uniform sampler2D u_texture;
uniform sampler2D u_texture_1;
// When set will clear the screen and draw the initial state
uniform bool u_initialize;
uniform float u_initial_length;
uniform float u_iteration;

out vec4 color_out;

bool in_bounds(vec2 target, vec2 lower_bounds, vec2 upper_bounds) {
    if (target.x <= lower_bounds.x || target.x >= upper_bounds.x)
        return false;

    if (target.y <= lower_bounds.y || target.y >= upper_bounds.y)
        return false;

    return true;
}

void main() {
    vec2 coords = gl_FragCoord.xy - u_dimensions / 2.0;
    // coords *= GOLDEN_RATIO;

    if (u_render) {
        coords += u_dimensions / 2.0;

        if (!in_bounds(coords, vec2(0.0, 0.0), u_dimensions)) {
            color_out = vec4(1.0, 1.0, 1.0, 1.0);
            return;
        }

        color_out = texelFetch(u_texture, ivec2(coords), 0);
        return;
    }

    if (u_initialize) {
        // draw a line from (0, 0) to (0, 1)
        if (in_bounds(coords, vec2(0.0, -1.0), vec2(u_initial_length, 1.0)))
            color_out = vec4(0.0, 0.0, 0.0, 1.0);
        else
            color_out = vec4(1.0, 1.0, 1.0, 0.0);

        return;
    }

    // transform end to origin
    vec2 transformed_start = coords - u_pivot;

    // convert to polar coords
    float r = length(transformed_start);
    if (r < 1.0) {
        color_out = vec4(1.0, 0.0, 0.0, 1.0);
        return;
    }

    float theta = atan(transformed_start.y, transformed_start.x);
    theta -= u_angle;

    // convert to cartesian coords and undo transform
    vec2 transformed_point = r * vec2(cos(theta), sin(theta));
    vec2 new_point = transformed_point + u_pivot;

    // + rotate coordinates and lookup texel
    vec2 final_coords = new_point + u_dimensions / 2.0;
    bool r_true =
        texelFetch(u_texture, ivec2(new_point + u_dimensions / 2.0), 0).a == 1.0;
    if (!in_bounds(final_coords, vec2(0.0, 0.0), u_dimensions))
        r_true = false;
    bool o_true = texelFetch(u_texture, ivec2(coords + u_dimensions/2.0), 0).a == 1.0;
    color_out = vec4(1.0, 1.0, 1.0, 0.0);
    if (o_true)
        color_out = vec4(0.0, 0.0, 1.0, 1.0);
    if (r_true)
        color_out = vec4(1.0, 0.0, 0.0, 1.0);

    // + use regular coordinates and lookup texel
    // + apply color
}
