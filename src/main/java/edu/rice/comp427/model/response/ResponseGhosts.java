package edu.rice.comp427.model.response;

import java.util.ArrayList;

public class ResponseGhosts {

    ArrayList<ResponseGhost> ghosts;

    /**
     * Constructor.
     */
    public ResponseGhosts makeResponse(ArrayList<ResponseGhost> ghosts) {
        this.ghosts = ghosts;
        return this;
    }
}
