import numpy as np

from wasserlinie.config import STATE_OFFSET, STATE_SCALE
from wasserlinie.daily import NO_DATA, decode_state, encode_state


def test_no_reading_is_not_a_record_low():
    # 0 means "nothing measured". If the scale started at 0 instead, every gap
    # in the archive would be drawn as the driest day ever recorded.
    codes = encode_state(np.array([np.nan, STATE_OFFSET, 0.0]))
    assert codes[0] == NO_DATA
    assert codes[1] != NO_DATA
    assert np.isnan(decode_state(codes)[0])


def test_the_byte_survives_the_round_trip():
    state = np.array([-1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5])
    back = decode_state(encode_state(state))
    # One byte over a three-wide scale: about 0.012 per step, so half a step is
    # the most a value can move.
    assert np.max(np.abs(back - state)) <= STATE_SCALE / 254 / 2 + 1e-9


def test_the_ends_of_the_scale_hold():
    codes = encode_state(np.array([STATE_OFFSET - 5, STATE_OFFSET + STATE_SCALE + 5]))
    assert codes[0] == 1
    assert codes[1] == 255
