import { Request, Response } from "express"; // No need for NextFunction here unless used elsewhere
import { AppDataSource } from "../../database/data-source";
import { User, UserRole } from "../entities/User";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Department } from "../entities/Department";
import { Branch } from "../entities/Branch"; // Import Branch entity
import { DeepPartial } from "typeorm";

// Extend the Request type to include the 'file' property from Multer
declare module 'express' {
  export interface Request {
    file?: Express.Multer.File;
  }
}

const userRepo = AppDataSource.getRepository(User);
const DeptRepo = AppDataSource.getRepository(Department);
const BranchRepo = AppDataSource.getRepository(Branch); // Initialize Branch repository
 
const signToken = (id: string) => {
  return jwt.sign({ id }, process.env.JWT_SECRET!, {
    expiresIn: "30d",
  });
};

export const register = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { name, email, password, role } = req.body;
    const department_id = req.body.department_id || undefined;
    const reports_to_id = req.body.reports_to_id || undefined;
    const branch_id = req.body.branch_id || undefined;
    const phone = req.body.phone || undefined;
    const address = req.body.address || undefined;
    const dob = req.body.dob ? new Date(req.body.dob) : undefined;


    // 1. Check if user exists
    const existingUser = await userRepo.findOne({ where: { email } }); 
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // 2. Validate department_id if provided
    if (department_id) {
      const department = await DeptRepo.findOne({ where: { id: department_id as string } }); 
      if (!department) {
        return res.status(400).json({ message: "Provided department does not exist." });
      }
    }
    // 3. Validate branch_id if provided
    if (branch_id) {
      const branch = await BranchRepo.findOne({ where: { id: branch_id } });
      if (!branch) {
        return res.status(400).json({ message: "Provided branch does not exist." });
      }
    }

    let profile_pic_url: string | undefined = undefined;
    if (req.file) {

      const imagePath = req.file.path.replace(/\\/g, "/"); 
      profile_pic_url = `${req.protocol}://${req.get("host")}/${imagePath}`;
    }

    // 2. Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create a well-typed object for the new user
    const newUserPayload: DeepPartial<User> = {
      name,
      email,
      password: hashedPassword,
      role: role || UserRole.GENERAL_STAFF,
      department_id: department_id,
      reports_to_id: reports_to_id,
      branch_id: branch_id,
      phone: phone,
      address: address,
      dob: dob,
      profile_pic_url: profile_pic_url,
    };

    // 3. Create user
    const newUser = userRepo.create(newUserPayload);

    await userRepo.save(newUser);

    // 4. Generate Token
    const token = signToken(newUser.id);

    // Remove password from output
    newUser.password = undefined as any;

    return res.status(201).json({
      status: "success",
      token,
      data: { user: newUser },
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const login = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { email, password } = req.body;

    // 1. Check if email & password exist
    if (!email || !password) {
      return res.status(400).json({ message: "Please provide email and password" }); // Keep return here for early exit
    }

    // 2. Check if user exists & password is correct
    // We select password because it's hidden by default in entity
    const user = await userRepo.createQueryBuilder("user")
      .addSelect("user.password")
      .where("user.email = :email", { email })
      .getOne();

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Incorrect email or password" });
    }

    // 3. Send Token
    const token = signToken(user.id);
    user.password = undefined as any;

    return res.status(200).json({
      status: "success",
      token,
      data: { user },
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};