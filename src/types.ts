import { ObjectId } from "mongodb";
import { Request } from "express";

export interface UserPayload {
  email: string;
  name?: string;
 _id?: ObjectId | string;
  updatedAt?:Date;
  createdAt?: Date;
}


export interface Plant {
  _id?: ObjectId | string;
  name: string;
  email: string;
  image: string;
  category: string;
  description: string;
  price: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthRequest extends Request {
  user: UserPayload;
}