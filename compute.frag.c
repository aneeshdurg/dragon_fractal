#version 300 es
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
precision highp int;
#else
precision mediump float;
precision mediump int;
#endif

#define PI 3.1415926538

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

out vec4 color_out;

void main() {
    if (u_render) {
        color_out =
            texelFetch(u_texture, ivec2(gl_FragCoord.xy), 0);
            //texelFetch(u_texture_1, ivec2(gl_FragCoord.xy), 0);
        return;

        bool dst = texelFetch(u_texture, ivec2(gl_FragCoord.xy), 0).r == 0.0;
        color_out = vec4(0.0, 0.0, 0.0, 1.0);

        if (dst)
            color_out.r = 1.0;
        bool src = texelFetch(u_texture_1, ivec2(gl_FragCoord.xy), 0).r == 0.0;
        if (src)
            color_out.b = 1.0;
        return;
    }

    vec2 coords = gl_FragCoord.xy - u_dimensions / 2.0;

    if (u_initialize) {
        // draw a line from (0, 0) to (0, 1)
        bool y_in_range = coords.y > -1.0 && coords.y < 1.0;
        bool x_in_range = coords.x >= 0.0 && coords.x < u_initial_length;
        if (y_in_range && x_in_range)
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
    if (final_coords.x < 0.0 || final_coords.x > u_dimensions.x ||
        final_coords.y < 0.0 || final_coords.y > u_dimensions.y)
        r_true = false;
    bool o_true = texelFetch(u_texture, ivec2(gl_FragCoord.xy), 0).a == 1.0;
    color_out = vec4(1.0, 1.0, 1.0, 0.0);
    if (o_true)
        color_out = vec4(0.0, 0.0, 1.0, 1.0);
    if (r_true)
        color_out = vec4(1.0, 0.0, 0.0, 1.0);

    // + use regular coordinates and lookup texel
    // + apply color
}
